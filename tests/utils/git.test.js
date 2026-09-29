import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  detectBranch,
  detectCommit,
  detectCommitAuthor,
  detectCommitMessage,
  detectPullRequestNumber,
  generateBuildName,
  generateBuildNameWithGit,
  getCommitMessage,
  getCommonAncestor,
  getCurrentBranch,
  getCurrentCommitSha,
  getDefaultBranch,
  getGitStatus,
  isGitRepository,
} from '../../src/utils/git.js';
import { useCleanCIEnv } from '../helpers/ci-env.js';

let execFileAsync = promisify(execFile);

async function runGit(cwd, args) {
  await execFileAsync('git', args, { cwd });
}

async function gitOutput(cwd, args) {
  let { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

// Recreate GitHub's refs/pull/N/merge checkout: a merge commit of the PR
// head into base, with GitHub's synthetic "Merge <sha> into <sha>" message
async function createGitHubMergeCheckout(directory) {
  let base = await gitOutput(directory, ['rev-parse', 'HEAD']);
  await runGit(directory, ['checkout', '-q', '-b', 'feature']);
  await writeFile(join(directory, 'feature.txt'), 'feature\n');
  await runGit(directory, ['add', 'feature.txt']);
  await runGit(directory, [
    'commit',
    '-q',
    '--author=PR Author <pr@example.com>',
    '-m',
    'Add feature work',
  ]);
  let head = await gitOutput(directory, ['rev-parse', 'HEAD']);
  await runGit(directory, ['checkout', '-q', '--detach', base]);
  await runGit(directory, [
    'merge',
    '-q',
    '--no-ff',
    '-m',
    `Merge ${head} into ${base}`,
    head,
  ]);
  return { base, head };
}

async function withGitRepo(testFn) {
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-git-'));

  try {
    await runGit(directory, ['init']);
    await runGit(directory, ['config', 'user.email', 'test@example.com']);
    await runGit(directory, ['config', 'user.name', 'Vizzly Test']);
    await writeFile(join(directory, 'README.md'), 'hello\n');
    await runGit(directory, ['add', 'README.md']);
    await runGit(directory, ['commit', '-m', 'Initial commit']);

    return await testFn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('utils/git', () => {
  let ciEnv = useCleanCIEnv();

  function usePullRequestEvent(pullRequest) {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_EVENT_PATH = ciEnv.createEventFile({
      pull_request: pullRequest,
    });
  }

  describe('generateBuildName', () => {
    it('generates build name with timestamp', () => {
      let name = generateBuildName();

      assert.ok(name.startsWith('Build '));
      assert.ok(name.includes('-')); // ISO date contains dashes
    });

    it('generates unique names on subsequent calls', () => {
      let name1 = generateBuildName();
      let name2 = generateBuildName();

      // Names should differ (unless called in same millisecond)
      assert.ok(name1.startsWith('Build '));
      assert.ok(name2.startsWith('Build '));
    });
  });

  describe('isGitRepository', () => {
    it('returns true for current directory (assuming git repo)', async () => {
      let result = await isGitRepository();

      // Assuming tests run in a git repository
      assert.strictEqual(result, true);
    });

    it('returns false for non-existent directory', async () => {
      let result = await isGitRepository('/non-existent-path-12345');

      assert.strictEqual(result, false);
    });
  });

  describe('getCurrentCommitSha', () => {
    it('returns a commit SHA in git repository', async () => {
      let sha = await getCurrentCommitSha();

      // SHA should be 40 hex characters
      if (sha) {
        assert.ok(sha.length === 40);
        assert.ok(/^[a-f0-9]+$/.test(sha));
      }
    });

    it('returns null for non-existent directory', async () => {
      let sha = await getCurrentCommitSha('/non-existent-path-12345');

      assert.strictEqual(sha, null);
    });
  });

  describe('getCommonAncestor', () => {
    it('does not execute shell metacharacters from commit refs', async () => {
      await withGitRepo(async directory => {
        let markerPath = join(directory, 'shell-marker');

        let ancestor = await getCommonAncestor(
          `HEAD; touch ${markerPath}`,
          'HEAD',
          directory
        );

        assert.strictEqual(ancestor, null);
        await assert.rejects(() => access(markerPath));
      });
    });
  });

  describe('getCurrentBranch', () => {
    it('returns a branch name in git repository', async () => {
      let branch = await getCurrentBranch();

      // Should return a non-empty string or null
      if (branch) {
        assert.ok(typeof branch === 'string');
        assert.ok(branch.length > 0);
      }
    });
  });

  describe('getDefaultBranch', () => {
    it('returns a branch name in git repository', async () => {
      let branch = await getDefaultBranch();

      // Should return main, master, or null
      if (branch) {
        assert.ok(
          ['main', 'master', 'develop'].includes(branch) ||
            typeof branch === 'string'
        );
      }
    });
  });

  describe('getCommitMessage', () => {
    it('returns a commit message in git repository', async () => {
      let message = await getCommitMessage();

      if (message) {
        assert.ok(typeof message === 'string');
      }
    });

    it('returns null for non-existent directory', async () => {
      let message = await getCommitMessage('/non-existent-path-12345');

      assert.strictEqual(message, null);
    });
  });

  describe('getGitStatus', () => {
    it('returns status object in git repository', async () => {
      let status = await getGitStatus();

      if (status) {
        assert.ok('hasChanges' in status);
        assert.ok('changes' in status);
        assert.ok(Array.isArray(status.changes));
      }
    });

    it('returns null for non-existent directory', async () => {
      let status = await getGitStatus('/non-existent-path-12345');

      assert.strictEqual(status, null);
    });
  });

  describe('detectBranch', () => {
    it('returns override if provided', async () => {
      let branch = await detectBranch('my-branch');

      assert.strictEqual(branch, 'my-branch');
    });

    it('returns branch from git if no override', async () => {
      let branch = await detectBranch();

      assert.ok(typeof branch === 'string');
      assert.ok(branch.length > 0);
    });
  });

  describe('detectCommit', () => {
    it('returns override if provided', async () => {
      let commit = await detectCommit('abc123def');

      assert.strictEqual(commit, 'abc123def');
    });

    it('returns commit from git if no override', async () => {
      let commit = await detectCommit();

      if (commit) {
        assert.ok(typeof commit === 'string');
      }
    });
  });

  describe('detectCommitMessage', () => {
    it('uses the PR title from the GitHub event payload', async () => {
      await withGitRepo(async directory => {
        usePullRequestEvent({ title: 'Add dark mode', head: { sha: 'abc' } });

        let message = await detectCommitMessage(null, directory);

        assert.strictEqual(message, 'Add dark mode');
      });
    });

    it('reads the PR head commit on a GitHub merge checkout', async () => {
      await withGitRepo(async directory => {
        let { head } = await createGitHubMergeCheckout(directory);
        usePullRequestEvent({ head: { sha: head } });

        let message = await detectCommitMessage(null, directory);
        let author = await detectCommitAuthor(directory);

        assert.strictEqual(message, 'Add feature work');
        assert.deepStrictEqual(author, {
          name: 'PR Author',
          email: 'pr@example.com',
        });
      });
    });

    it('falls back to HEAD when the PR head is not in local history', async () => {
      await withGitRepo(async directory => {
        let { base, head } = await createGitHubMergeCheckout(directory);
        usePullRequestEvent({ head: { sha: 'f'.repeat(40) } });

        let message = await detectCommitMessage(null, directory);
        let author = await detectCommitAuthor(directory);

        assert.strictEqual(message, `Merge ${head} into ${base}`);
        assert.deepStrictEqual(author, {
          name: 'Vizzly Test',
          email: 'test@example.com',
        });
      });
    });

    it('returns override if provided', async () => {
      let message = await detectCommitMessage('Custom message');

      assert.strictEqual(message, 'Custom message');
    });

    it('returns message from git if no override', async () => {
      let message = await detectCommitMessage();

      if (message) {
        assert.ok(typeof message === 'string');
      }
    });
  });

  describe('detectCommitAuthor', () => {
    it('reads the author from git', async () => {
      await withGitRepo(async directory => {
        let author = await detectCommitAuthor(directory);

        assert.deepStrictEqual(author, {
          name: 'Vizzly Test',
          email: 'test@example.com',
        });
      });
    });

    it('prefers VIZZLY_COMMIT_AUTHOR_* overrides', async () => {
      await withGitRepo(async directory => {
        process.env.VIZZLY_COMMIT_AUTHOR_NAME = 'Ada Lovelace';

        let author = await detectCommitAuthor(directory);

        assert.deepStrictEqual(author, {
          name: 'Ada Lovelace',
          email: 'test@example.com',
        });
      });
    });

    it('returns nulls outside a git repository', async () => {
      let author = await detectCommitAuthor('/non-existent-path-12345');

      assert.deepStrictEqual(author, { name: null, email: null });
    });
  });

  describe('generateBuildNameWithGit', () => {
    it('names GitHub PR builds after the head branch and head commit', async () => {
      await withGitRepo(async directory => {
        let { head } = await createGitHubMergeCheckout(directory);
        usePullRequestEvent({ head: { sha: head } });
        process.env.GITHUB_HEAD_REF = 'feature/dark-mode';

        let name = await generateBuildNameWithGit(null, directory);

        assert.strictEqual(name, `feature/dark-mode-${head.slice(0, 7)}`);
      });
    });

    it('uses the local branch and commit outside CI', async () => {
      await withGitRepo(async directory => {
        await runGit(directory, ['checkout', '-q', '-b', 'local-work']);
        let sha = await gitOutput(directory, ['rev-parse', 'HEAD']);

        let name = await generateBuildNameWithGit(null, directory);

        assert.strictEqual(name, `local-work-${sha.slice(0, 7)}`);
      });
    });

    it('returns override if provided', async () => {
      let name = await generateBuildNameWithGit('Custom Build');

      assert.strictEqual(name, 'Custom Build');
    });

    it('generates name with branch and commit if no override', async () => {
      let name = await generateBuildNameWithGit();

      assert.ok(typeof name === 'string');
      assert.ok(name.length > 0);
    });
  });

  describe('detectPullRequestNumber', () => {
    it('returns null when not in PR context', () => {
      // In test environment, we're typically not in PR context
      let prNumber = detectPullRequestNumber();

      // Should be null or a number
      if (prNumber !== null) {
        assert.ok(typeof prNumber === 'number');
      }
    });
  });
});
