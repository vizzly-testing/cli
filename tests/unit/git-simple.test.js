import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  detectBranch,
  detectCommit,
  generateBuildName,
} from '../../src/utils/git.js';
import { resetGitHubEventCache } from '../../src/utils/ci-env.js';

describe('Git Utilities - Simple Tests', () => {
  let originalDateNow;
  let originalToISOString;
  let originalEnv;

  beforeEach(() => {
    originalDateNow = Date.now;
    originalToISOString = Date.prototype.toISOString;
    originalEnv = { ...process.env };

    Date.now = () => new Date('2023-01-01T12:00:00Z').getTime();
    Date.prototype.toISOString = () => '2023-01-01T12:00:00.000Z';

    // Clear CI env vars that affect git detection
    delete process.env.VIZZLY_BRANCH;
    delete process.env.VIZZLY_COMMIT_SHA;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_HEAD_REF;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_EVENT_PATH;
    delete process.env.CI_COMMIT_REF_NAME;
    delete process.env.CI_COMMIT_SHA;
    // Reset the GitHub event cache
    resetGitHubEventCache();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    Date.prototype.toISOString = originalToISOString;
    // Restore environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('generateBuildName', () => {
    it('should generate build name with timestamp', () => {
      let result = generateBuildName();
      assert.strictEqual(result, 'Build 2023-01-01T12-00-00-000Z');
    });
  });

  describe('detectBranch', () => {
    it('should return override when provided', async () => {
      let result = await detectBranch('feature-branch');
      assert.strictEqual(result, 'feature-branch');
    });

    it('should return VIZZLY_BRANCH env var when set', async () => {
      process.env.VIZZLY_BRANCH = 'ci-branch';
      let result = await detectBranch(null, process.cwd());
      assert.strictEqual(result, 'ci-branch');
    });

    it('should return GitHub PR branch when set', async () => {
      process.env.GITHUB_HEAD_REF = 'github-pr-branch';
      let result = await detectBranch(null, process.cwd());
      assert.strictEqual(result, 'github-pr-branch');
    });

    it('should return unknown when no override and git fails', async () => {
      let result = await detectBranch(null, '/non/existent/path');
      assert.strictEqual(result, 'unknown');
    });
  });

  describe('detectCommit', () => {
    it('should return override when provided', async () => {
      let result = await detectCommit('custom-commit-sha');
      assert.strictEqual(result, 'custom-commit-sha');
    });

    it('should return VIZZLY_COMMIT_SHA env var when set', async () => {
      process.env.VIZZLY_COMMIT_SHA = 'env-commit-sha';
      let result = await detectCommit(null, process.cwd());
      assert.strictEqual(result, 'env-commit-sha');
    });

    it('should return GitHub SHA when in GitHub Actions', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_SHA = 'github-commit-sha';
      let result = await detectCommit(null, process.cwd());
      assert.strictEqual(result, 'github-commit-sha');
    });

    it('should return null when no override, git fails, and no env vars', async () => {
      let result = await detectCommit(null, '/non/existent/path');
      assert.strictEqual(result, null);
    });
  });
});
