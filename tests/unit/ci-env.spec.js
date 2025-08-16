import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getBranch,
  getCommit,
  getCommitMessage,
  getPullRequestNumber,
  getCIProvider,
} from '../../src/utils/ci-env.js';

describe('CI Environment Detection', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear only CI-related environment variables
    const ciVars = [
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
    ciVars.forEach(key => delete process.env[key]);
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

      expect(getBranch()).toBe('vizzly-branch');
    });

    it('should return GitHub Actions branch for PRs', () => {
      process.env.GITHUB_HEAD_REF = 'feature/new-ui';

      expect(getBranch()).toBe('feature/new-ui');
    });

    it('should return GitHub Actions branch for pushes', () => {
      process.env.GITHUB_REF_NAME = 'main';

      expect(getBranch()).toBe('main');
    });

    it('should return GitLab CI branch', () => {
      process.env.CI_COMMIT_REF_NAME = 'develop';

      expect(getBranch()).toBe('develop');
    });

    it('should return null when no branch detected', () => {
      expect(getBranch()).toBe(null);
    });
  });

  describe('getCommit', () => {
    it('should return VIZZLY_COMMIT_SHA when set', () => {
      process.env.VIZZLY_COMMIT_SHA = 'vizzly-commit';
      process.env.GITHUB_SHA = 'github-commit';

      expect(getCommit()).toBe('vizzly-commit');
    });

    it('should return GitHub Actions commit', () => {
      process.env.GITHUB_SHA = 'abc123def456';

      expect(getCommit()).toBe('abc123def456');
    });

    it('should return GitLab CI commit', () => {
      process.env.CI_COMMIT_SHA = 'def456ghi789';

      expect(getCommit()).toBe('def456ghi789');
    });

    it('should return null when no commit detected', () => {
      expect(getCommit()).toBe(null);
    });
  });

  describe('getCommitMessage', () => {
    it('should return VIZZLY_COMMIT_MESSAGE when set', () => {
      process.env.VIZZLY_COMMIT_MESSAGE = 'Vizzly commit message';
      process.env.CI_COMMIT_MESSAGE = 'CI commit message';

      expect(getCommitMessage()).toBe('Vizzly commit message');
    });

    it('should return GitLab CI commit message', () => {
      process.env.CI_COMMIT_MESSAGE = 'Fix: Update component';

      expect(getCommitMessage()).toBe('Fix: Update component');
    });

    it('should return null when no commit message detected', () => {
      expect(getCommitMessage()).toBe(null);
    });
  });

  describe('getPullRequestNumber', () => {
    it('should return VIZZLY_PR_NUMBER when set', () => {
      process.env.VIZZLY_PR_NUMBER = '999';
      process.env.CI_MERGE_REQUEST_ID = '123';

      expect(getPullRequestNumber()).toBe(999);
    });

    it('should return GitHub Actions PR number', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_REF = 'refs/pull/456/merge';

      expect(getPullRequestNumber()).toBe(456);
    });

    it('should return GitLab CI merge request ID', () => {
      process.env.CI_MERGE_REQUEST_ID = '789';

      expect(getPullRequestNumber()).toBe(789);
    });

    it('should return CircleCI PR number from URL', () => {
      process.env.CIRCLE_PULL_REQUEST =
        'https://github.com/owner/repo/pull/321';

      expect(getPullRequestNumber()).toBe(321);
    });

    it('should return Travis CI PR number', () => {
      process.env.TRAVIS_PULL_REQUEST = '654';

      expect(getPullRequestNumber()).toBe(654);
    });

    it('should return null for Travis CI when not a PR', () => {
      process.env.TRAVIS_PULL_REQUEST = 'false';

      expect(getPullRequestNumber()).toBe(null);
    });

    it('should return null when no PR detected', () => {
      expect(getPullRequestNumber()).toBe(null);
    });
  });

  describe('getCIProvider', () => {
    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';

      expect(getCIProvider()).toBe('github-actions');
    });

    it('should detect GitLab CI', () => {
      process.env.GITLAB_CI = 'true';

      expect(getCIProvider()).toBe('gitlab-ci');
    });

    it('should detect CircleCI', () => {
      process.env.CIRCLECI = 'true';

      expect(getCIProvider()).toBe('circleci');
    });

    it('should detect Travis CI', () => {
      process.env.TRAVIS = 'true';

      expect(getCIProvider()).toBe('travis-ci');
    });

    it('should return unknown when no CI detected', () => {
      expect(getCIProvider()).toBe('unknown');
    });
  });
});
