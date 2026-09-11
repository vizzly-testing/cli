import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createPluginServices } from '../../src/plugin-api.js';
import { resetGitHubEventCache } from '../../src/utils/ci-env.js';

describe('Plugin API', () => {
  let originalEnv;

  // Minimal mock services required by createPluginServices
  let mockServices = {
    testRunner: {
      once: () => {},
      on: () => {},
      off: () => {},
      createBuild: () => {},
      finalizeBuild: () => {},
    },
    serverManager: {
      start: () => {},
      stop: () => {},
    },
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear CI-related environment variables
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
      'GITHUB_EVENT_PATH',
      'GITHUB_REF',
    ];
    for (let key of ciVars) {
      delete process.env[key];
    }
    resetGitHubEventCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetGitHubEventCache();
  });

  describe('createPluginServices', () => {
    it('returns frozen object with expected shape', () => {
      let services = createPluginServices(mockServices);

      assert.ok(Object.isFrozen(services), 'services should be frozen');
      assert.ok(services.git, 'should have git property');
      assert.ok(services.testRunner, 'should have testRunner property');
      assert.ok(services.serverManager, 'should have serverManager property');
    });

    it('exposes git.detect as a function', () => {
      let services = createPluginServices(mockServices);

      assert.strictEqual(typeof services.git.detect, 'function');
    });

    it('exposes testRunner methods', () => {
      let services = createPluginServices(mockServices);

      assert.strictEqual(typeof services.testRunner.once, 'function');
      assert.strictEqual(typeof services.testRunner.on, 'function');
      assert.strictEqual(typeof services.testRunner.off, 'function');
      assert.strictEqual(typeof services.testRunner.createBuild, 'function');
      assert.strictEqual(typeof services.testRunner.finalizeBuild, 'function');
    });

    it('exposes serverManager methods', () => {
      let services = createPluginServices(mockServices);

      assert.strictEqual(typeof services.serverManager.start, 'function');
      assert.strictEqual(typeof services.serverManager.stop, 'function');
    });
  });

  describe('services.git.detect', () => {
    it('returns object with expected properties', async () => {
      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      assert.ok('branch' in result, 'should have branch property');
      assert.ok('commit' in result, 'should have commit property');
      assert.ok('message' in result, 'should have message property');
      assert.ok('prNumber' in result, 'should have prNumber property');
      assert.ok('buildName' in result, 'should have buildName property');
    });

    it('detects branch from local git repo', async () => {
      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      // We're in a git repo, so branch should be detected
      assert.ok(result.branch, 'branch should be detected');
      assert.strictEqual(typeof result.branch, 'string');
    });

    it('detects commit from local git repo', async () => {
      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      // We're in a git repo, so commit should be detected
      assert.ok(result.commit, 'commit should be detected');
      assert.strictEqual(
        result.commit.length,
        40,
        'commit should be 40 char SHA'
      );
    });

    it('uses buildPrefix in buildName when provided', async () => {
      let services = createPluginServices(mockServices);
      let result = await services.git.detect({ buildPrefix: 'Storybook' });

      assert.ok(result.buildName, 'buildName should be present');
      assert.ok(
        result.buildName.startsWith('Storybook'),
        `buildName should start with prefix, got: ${result.buildName}`
      );
    });

    it('respects VIZZLY_BRANCH environment variable', async () => {
      process.env.VIZZLY_BRANCH = 'custom-branch';

      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      assert.strictEqual(result.branch, 'custom-branch');
    });

    it('respects VIZZLY_COMMIT_SHA environment variable', async () => {
      process.env.VIZZLY_COMMIT_SHA = 'abc123def456';

      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      assert.strictEqual(result.commit, 'abc123def456');
    });

    it('detects GitHub Actions PR context', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_HEAD_REF = 'feature/my-branch';
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_REF = 'refs/pull/42/merge';

      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      assert.strictEqual(result.branch, 'feature/my-branch');
      assert.strictEqual(result.prNumber, 42);
    });

    it('returns null for prNumber when not in PR context', async () => {
      let services = createPluginServices(mockServices);
      let result = await services.git.detect();

      // Not in a PR context, so prNumber should be null
      assert.strictEqual(result.prNumber, null);
    });
  });
});
