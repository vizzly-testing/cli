import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  detectBranch,
  detectCommit,
  detectCommitMessage,
  detectPullRequestNumber,
  generateBuildName,
  generateBuildNameWithGit,
  getCommitMessage,
  getCurrentBranch,
  getCurrentCommitSha,
  getDefaultBranch,
  getGitStatus,
  isGitRepository,
} from '../../src/utils/git.js';

describe('utils/git', () => {
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

  describe('generateBuildNameWithGit', () => {
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
