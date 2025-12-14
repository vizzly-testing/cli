import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildApiBuildPayload,
  buildClientOptions,
  buildDisabledEnv,
  buildDisabledRunResult,
  buildRunResult,
  buildSpawnOptions,
  buildTestEnv,
  determineBuildMode,
  hasApiKey,
  normalizeSetBaseline,
  shouldDisableVizzly,
  validateDaemonMode,
  validateTestCommand,
} from '../../src/test-runner/core.js';

describe('test-runner/core', () => {
  describe('buildTestEnv', () => {
    it('builds environment with all required variables', () => {
      let env = buildTestEnv({
        port: 8080,
        buildId: 'build-123',
        setBaseline: false,
        baseEnv: { NODE_ENV: 'test' },
      });

      assert.deepStrictEqual(env, {
        NODE_ENV: 'test',
        VIZZLY_SERVER_URL: 'http://localhost:8080',
        VIZZLY_BUILD_ID: 'build-123',
        VIZZLY_ENABLED: 'true',
        VIZZLY_SET_BASELINE: 'false',
      });
    });

    it('sets VIZZLY_SET_BASELINE to true when setBaseline is true', () => {
      let env = buildTestEnv({
        port: 3000,
        buildId: 'build-abc',
        setBaseline: true,
        baseEnv: {},
      });

      assert.strictEqual(env.VIZZLY_SET_BASELINE, 'true');
    });

    it('preserves existing environment variables', () => {
      let env = buildTestEnv({
        port: 3000,
        buildId: 'build-xyz',
        baseEnv: { EXISTING_VAR: 'value', PATH: '/usr/bin' },
      });

      assert.strictEqual(env.EXISTING_VAR, 'value');
      assert.strictEqual(env.PATH, '/usr/bin');
      assert.strictEqual(env.VIZZLY_ENABLED, 'true');
    });

    it('defaults setBaseline to false', () => {
      let env = buildTestEnv({
        port: 3000,
        buildId: 'build-123',
        baseEnv: {},
      });

      assert.strictEqual(env.VIZZLY_SET_BASELINE, 'false');
    });
  });

  describe('buildDisabledEnv', () => {
    it('builds environment with VIZZLY_ENABLED set to false', () => {
      let env = buildDisabledEnv({ NODE_ENV: 'test' });

      assert.deepStrictEqual(env, {
        NODE_ENV: 'test',
        VIZZLY_ENABLED: 'false',
      });
    });

    it('preserves existing environment variables', () => {
      let env = buildDisabledEnv({ EXISTING: 'value' });

      assert.strictEqual(env.EXISTING, 'value');
      assert.strictEqual(env.VIZZLY_ENABLED, 'false');
    });
  });

  describe('buildApiBuildPayload', () => {
    it('builds payload with all options', () => {
      let options = {
        buildName: 'My Build',
        branch: 'feature/test',
        environment: 'staging',
        commit: 'abc123',
        message: 'Test commit',
        pullRequestNumber: 42,
        parallelId: 'parallel-1',
      };

      let payload = buildApiBuildPayload(options);

      assert.deepStrictEqual(payload, {
        name: 'My Build',
        branch: 'feature/test',
        environment: 'staging',
        commit_sha: 'abc123',
        commit_message: 'Test commit',
        github_pull_request_number: 42,
        parallel_id: 'parallel-1',
      });
    });

    it('uses defaults for missing options', () => {
      let payload = buildApiBuildPayload({});

      assert.strictEqual(payload.branch, 'main');
      assert.strictEqual(payload.environment, 'test');
      assert.ok(payload.name.match(/^Test Run \d{4}-\d{2}-\d{2}/));
    });

    it('includes metadata when comparison config has threshold', () => {
      let payload = buildApiBuildPayload({}, { threshold: 5.0 });

      assert.deepStrictEqual(payload.metadata, {
        comparison: {
          threshold: 5.0,
          minClusterSize: undefined,
        },
      });
    });

    it('includes metadata when comparison config has minClusterSize', () => {
      let payload = buildApiBuildPayload({}, { minClusterSize: 10 });

      assert.deepStrictEqual(payload.metadata, {
        comparison: {
          threshold: undefined,
          minClusterSize: 10,
        },
      });
    });

    it('includes both threshold and minClusterSize in metadata', () => {
      let payload = buildApiBuildPayload(
        {},
        { threshold: 2.5, minClusterSize: 5 }
      );

      assert.deepStrictEqual(payload.metadata, {
        comparison: {
          threshold: 2.5,
          minClusterSize: 5,
        },
      });
    });

    it('does not include metadata when no comparison config', () => {
      let payload = buildApiBuildPayload({}, null);

      assert.strictEqual(payload.metadata, undefined);
    });

    it('does not include metadata when comparison config is empty', () => {
      let payload = buildApiBuildPayload({}, {});

      assert.strictEqual(payload.metadata, undefined);
    });
  });

  describe('shouldDisableVizzly', () => {
    it('returns true when allowNoToken and no API key and not TDD', () => {
      let result = shouldDisableVizzly({
        allowNoToken: true,
        hasApiKey: false,
        tdd: false,
      });

      assert.strictEqual(result, true);
    });

    it('returns false when API key is present', () => {
      let result = shouldDisableVizzly({
        allowNoToken: true,
        hasApiKey: true,
        tdd: false,
      });

      assert.strictEqual(result, false);
    });

    it('returns false when TDD mode is enabled', () => {
      let result = shouldDisableVizzly({
        allowNoToken: true,
        hasApiKey: false,
        tdd: true,
      });

      assert.strictEqual(result, false);
    });

    it('returns false when allowNoToken is false', () => {
      let result = shouldDisableVizzly({
        allowNoToken: false,
        hasApiKey: false,
        tdd: false,
      });

      assert.strictEqual(result, false);
    });
  });

  describe('determineBuildMode', () => {
    it('returns tdd when tdd is true', () => {
      assert.strictEqual(determineBuildMode(true), 'tdd');
    });

    it('returns api when tdd is false', () => {
      assert.strictEqual(determineBuildMode(false), 'api');
    });
  });

  describe('buildDisabledRunResult', () => {
    it('returns result with no failures and no screenshots', () => {
      let result = buildDisabledRunResult();

      assert.deepStrictEqual(result, {
        testsPassed: 1,
        testsFailed: 0,
        screenshotsCaptured: 0,
      });
    });
  });

  describe('buildRunResult', () => {
    it('builds result for successful run', () => {
      let result = buildRunResult({
        buildId: 'build-123',
        buildUrl: 'https://app.vizzly.dev/builds/123',
        testSuccess: true,
        screenshotCount: 10,
        tddResults: null,
      });

      assert.deepStrictEqual(result, {
        buildId: 'build-123',
        url: 'https://app.vizzly.dev/builds/123',
        testsPassed: 1,
        testsFailed: 0,
        screenshotsCaptured: 10,
        comparisons: null,
        failed: false,
      });
    });

    it('builds result for failed run', () => {
      let result = buildRunResult({
        buildId: 'build-456',
        buildUrl: null,
        testSuccess: false,
        screenshotCount: 5,
        tddResults: null,
      });

      assert.deepStrictEqual(result, {
        buildId: 'build-456',
        url: null,
        testsPassed: 0,
        testsFailed: 1,
        screenshotsCaptured: 5,
        comparisons: null,
        failed: false,
      });
    });

    it('includes TDD comparisons', () => {
      let comparisons = [
        { name: 'test-1', status: 'passed' },
        { name: 'test-2', status: 'failed' },
      ];

      let result = buildRunResult({
        buildId: 'build-789',
        buildUrl: null,
        testSuccess: true,
        screenshotCount: 2,
        tddResults: { comparisons, failed: 1 },
      });

      assert.deepStrictEqual(result.comparisons, comparisons);
      assert.strictEqual(result.failed, true);
    });

    it('handles empty TDD results', () => {
      let result = buildRunResult({
        buildId: 'build-abc',
        buildUrl: null,
        testSuccess: true,
        screenshotCount: 0,
        tddResults: {},
      });

      assert.strictEqual(result.comparisons, null);
      assert.strictEqual(result.failed, false);
    });
  });

  describe('validateTestCommand', () => {
    it('returns valid for non-empty command', () => {
      let result = validateTestCommand('npm test');

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid for undefined command', () => {
      let result = validateTestCommand(undefined);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'No test command provided');
    });

    it('returns invalid for empty string', () => {
      let result = validateTestCommand('');

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'No test command provided');
    });

    it('returns invalid for null command', () => {
      let result = validateTestCommand(null);

      assert.strictEqual(result.valid, false);
    });
  });

  describe('validateDaemonMode', () => {
    it('returns valid for TDD daemon mode', () => {
      let result = validateDaemonMode({ tdd: true, daemon: true });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid when tdd is false', () => {
      let result = validateDaemonMode({ tdd: false, daemon: true });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(
        result.error,
        'Initialize method is only for TDD daemon mode'
      );
    });

    it('returns invalid when daemon is false', () => {
      let result = validateDaemonMode({ tdd: true, daemon: false });

      assert.strictEqual(result.valid, false);
    });

    it('returns invalid when both are false', () => {
      let result = validateDaemonMode({ tdd: false, daemon: false });

      assert.strictEqual(result.valid, false);
    });
  });

  describe('buildClientOptions', () => {
    it('builds options from config with API key', () => {
      let options = buildClientOptions({
        apiKey: 'test-key',
        apiUrl: 'https://api.example.com',
      });

      assert.deepStrictEqual(options, {
        baseUrl: 'https://api.example.com',
        token: 'test-key',
        command: 'run',
      });
    });

    it('returns null when no API key', () => {
      let options = buildClientOptions({ apiUrl: 'https://api.example.com' });

      assert.strictEqual(options, null);
    });

    it('returns null for empty API key', () => {
      let options = buildClientOptions({
        apiKey: '',
        apiUrl: 'https://api.example.com',
      });

      assert.strictEqual(options, null);
    });

    it('returns null for undefined config', () => {
      let options = buildClientOptions(undefined);

      assert.strictEqual(options, null);
    });
  });

  describe('hasApiKey', () => {
    it('returns true when API key exists', () => {
      assert.strictEqual(hasApiKey({ apiKey: 'test-key' }), true);
    });

    it('returns false when no API key', () => {
      assert.strictEqual(hasApiKey({ apiUrl: 'https://api.example.com' }), false);
    });

    it('returns false for empty API key', () => {
      assert.strictEqual(hasApiKey({ apiKey: '' }), false);
    });

    it('returns false for undefined config', () => {
      assert.strictEqual(hasApiKey(undefined), false);
    });
  });

  describe('buildSpawnOptions', () => {
    it('builds spawn options with environment', () => {
      let env = { NODE_ENV: 'test', VIZZLY_ENABLED: 'true' };
      let options = buildSpawnOptions(env);

      assert.deepStrictEqual(options, {
        env,
        stdio: 'inherit',
        shell: true,
      });
    });

    it('builds spawn options with empty environment', () => {
      let options = buildSpawnOptions({});

      assert.deepStrictEqual(options, {
        env: {},
        stdio: 'inherit',
        shell: true,
      });
    });
  });

  describe('normalizeSetBaseline', () => {
    it('returns true for camelCase setBaseline', () => {
      assert.strictEqual(normalizeSetBaseline({ setBaseline: true }), true);
    });

    it('returns true for kebab-case set-baseline', () => {
      assert.strictEqual(normalizeSetBaseline({ 'set-baseline': true }), true);
    });

    it('returns false when neither is set', () => {
      assert.strictEqual(normalizeSetBaseline({}), false);
    });

    it('returns false for undefined options', () => {
      assert.strictEqual(normalizeSetBaseline(undefined), false);
    });

    it('returns false for null options', () => {
      assert.strictEqual(normalizeSetBaseline(null), false);
    });

    it('returns true when both are set (camelCase takes precedence)', () => {
      assert.strictEqual(
        normalizeSetBaseline({ setBaseline: true, 'set-baseline': false }),
        true
      );
    });
  });
});
