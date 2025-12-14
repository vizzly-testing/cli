import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  getBranch,
  getCIProvider,
  getCommit,
  getCommitMessage,
  getPullRequestNumber,
} from '../../src/utils/ci-env.js';

describe('CI Environment Detection', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear only CI-related environment variables
    let ciVars = [
      'VIZZLY_BRANCH',
      'VIZZLY_COMMIT_SHA',
      'VIZZLY_COMMIT_MESSAGE',
      'VIZZLY_PR_NUMBER',
      'GITHUB_ACTIONS',
      'GITHUB_HEAD_REF',
      'GITHUB_REF_NAME',
      'GITHUB_SHA',
      'GITHUB_EVENT_NAME',
      'GITHUB_REF',
      'GITLAB_CI',
      'CI_COMMIT_REF_NAME',
      'CI_COMMIT_SHA',
      'CI_COMMIT_MESSAGE',
      'CI_MERGE_REQUEST_ID',
      'CIRCLECI',
      'CIRCLE_PULL_REQUEST',
      'TRAVIS',
      'TRAVIS_PULL_REQUEST',
    ];
    for (let key of ciVars) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('getBranch', () => {
    it('should return VIZZLY_BRANCH when set', () => {
      process.env.VIZZLY_BRANCH = 'vizzly-branch';
      process.env.GITHUB_HEAD_REF = 'github-branch';

      assert.strictEqual(getBranch(), 'vizzly-branch');
    });

    it('should return GitHub Actions branch for PRs', () => {
      process.env.GITHUB_HEAD_REF = 'feature/new-ui';

      assert.strictEqual(getBranch(), 'feature/new-ui');
    });

    it('should return GitHub Actions branch for pushes', () => {
      process.env.GITHUB_REF_NAME = 'main';

      assert.strictEqual(getBranch(), 'main');
    });

    it('should return GitLab CI branch', () => {
      process.env.CI_COMMIT_REF_NAME = 'develop';

      assert.strictEqual(getBranch(), 'develop');
    });

    it('should return null when no branch detected', () => {
      assert.strictEqual(getBranch(), null);
    });
  });

  describe('getCommit', () => {
    it('should return VIZZLY_COMMIT_SHA when set', () => {
      process.env.VIZZLY_COMMIT_SHA = 'vizzly-commit';
      process.env.GITHUB_SHA = 'github-commit';

      assert.strictEqual(getCommit(), 'vizzly-commit');
    });

    it('should return GitHub Actions commit', () => {
      process.env.GITHUB_SHA = 'abc123def456';

      assert.strictEqual(getCommit(), 'abc123def456');
    });

    it('should return GitLab CI commit', () => {
      process.env.CI_COMMIT_SHA = 'def456ghi789';

      assert.strictEqual(getCommit(), 'def456ghi789');
    });

    it('should return null when no commit detected', () => {
      assert.strictEqual(getCommit(), null);
    });
  });

  describe('getCommitMessage', () => {
    it('should return VIZZLY_COMMIT_MESSAGE when set', () => {
      process.env.VIZZLY_COMMIT_MESSAGE = 'Vizzly commit message';
      process.env.CI_COMMIT_MESSAGE = 'CI commit message';

      assert.strictEqual(getCommitMessage(), 'Vizzly commit message');
    });

    it('should return GitLab CI commit message', () => {
      process.env.CI_COMMIT_MESSAGE = 'Fix: Update component';

      assert.strictEqual(getCommitMessage(), 'Fix: Update component');
    });

    it('should return null when no commit message detected', () => {
      assert.strictEqual(getCommitMessage(), null);
    });
  });

  describe('getPullRequestNumber', () => {
    it('should return VIZZLY_PR_NUMBER when set', () => {
      process.env.VIZZLY_PR_NUMBER = '999';
      process.env.CI_MERGE_REQUEST_ID = '123';

      assert.strictEqual(getPullRequestNumber(), 999);
    });

    it('should return GitHub Actions PR number', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_REF = 'refs/pull/456/merge';

      assert.strictEqual(getPullRequestNumber(), 456);
    });

    it('should return GitLab CI merge request ID', () => {
      process.env.CI_MERGE_REQUEST_ID = '789';

      assert.strictEqual(getPullRequestNumber(), 789);
    });

    it('should return CircleCI PR number from URL', () => {
      process.env.CIRCLE_PULL_REQUEST =
        'https://github.com/owner/repo/pull/321';

      assert.strictEqual(getPullRequestNumber(), 321);
    });

    it('should return Travis CI PR number', () => {
      process.env.TRAVIS_PULL_REQUEST = '654';

      assert.strictEqual(getPullRequestNumber(), 654);
    });

    it('should return null for Travis CI when not a PR', () => {
      process.env.TRAVIS_PULL_REQUEST = 'false';

      assert.strictEqual(getPullRequestNumber(), null);
    });

    it('should return null when no PR detected', () => {
      assert.strictEqual(getPullRequestNumber(), null);
    });
  });

  describe('getCIProvider', () => {
    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';

      assert.strictEqual(getCIProvider(), 'github-actions');
    });

    it('should detect GitLab CI', () => {
      process.env.GITLAB_CI = 'true';

      assert.strictEqual(getCIProvider(), 'gitlab-ci');
    });

    it('should detect CircleCI', () => {
      process.env.CIRCLECI = 'true';

      assert.strictEqual(getCIProvider(), 'circleci');
    });

    it('should detect Travis CI', () => {
      process.env.TRAVIS = 'true';

      assert.strictEqual(getCIProvider(), 'travis-ci');
    });

    it('should return unknown when no CI detected', () => {
      assert.strictEqual(getCIProvider(), 'unknown');
    });
  });
});
