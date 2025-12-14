import { describe, expect, it } from 'vitest';
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

      expect(env).toEqual({
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

      expect(env.VIZZLY_SET_BASELINE).toBe('true');
    });

    it('preserves existing environment variables', () => {
      let env = buildTestEnv({
        port: 3000,
        buildId: 'build-xyz',
        baseEnv: { EXISTING_VAR: 'value', PATH: '/usr/bin' },
      });

      expect(env.EXISTING_VAR).toBe('value');
      expect(env.PATH).toBe('/usr/bin');
      expect(env.VIZZLY_ENABLED).toBe('true');
    });

    it('defaults setBaseline to false', () => {
      let env = buildTestEnv({
        port: 3000,
        buildId: 'build-123',
        baseEnv: {},
      });

      expect(env.VIZZLY_SET_BASELINE).toBe('false');
    });
  });

  describe('buildDisabledEnv', () => {
    it('builds environment with VIZZLY_ENABLED set to false', () => {
      let env = buildDisabledEnv({ NODE_ENV: 'test' });

      expect(env).toEqual({
        NODE_ENV: 'test',
        VIZZLY_ENABLED: 'false',
      });
    });

    it('preserves existing environment variables', () => {
      let env = buildDisabledEnv({ EXISTING: 'value' });

      expect(env.EXISTING).toBe('value');
      expect(env.VIZZLY_ENABLED).toBe('false');
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

      expect(payload).toEqual({
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

      expect(payload.branch).toBe('main');
      expect(payload.environment).toBe('test');
      expect(payload.name).toMatch(/^Test Run \d{4}-\d{2}-\d{2}/);
    });

    it('includes metadata when comparison config has threshold', () => {
      let payload = buildApiBuildPayload({}, { threshold: 5.0 });

      expect(payload.metadata).toEqual({
        comparison: {
          threshold: 5.0,
          minClusterSize: undefined,
        },
      });
    });

    it('includes metadata when comparison config has minClusterSize', () => {
      let payload = buildApiBuildPayload({}, { minClusterSize: 10 });

      expect(payload.metadata).toEqual({
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

      expect(payload.metadata).toEqual({
        comparison: {
          threshold: 2.5,
          minClusterSize: 5,
        },
      });
    });

    it('does not include metadata when no comparison config', () => {
      let payload = buildApiBuildPayload({}, null);

      expect(payload.metadata).toBeUndefined();
    });

    it('does not include metadata when comparison config is empty', () => {
      let payload = buildApiBuildPayload({}, {});

      expect(payload.metadata).toBeUndefined();
    });
  });

  describe('shouldDisableVizzly', () => {
    it('returns true when allowNoToken and no API key and not TDD', () => {
      let result = shouldDisableVizzly({
        allowNoToken: true,
        hasApiKey: false,
        tdd: false,
      });

      expect(result).toBe(true);
    });

    it('returns false when API key is present', () => {
      let result = shouldDisableVizzly({
        allowNoToken: true,
        hasApiKey: true,
        tdd: false,
      });

      expect(result).toBe(false);
    });

    it('returns false when TDD mode is enabled', () => {
      let result = shouldDisableVizzly({
        allowNoToken: true,
        hasApiKey: false,
        tdd: true,
      });

      expect(result).toBe(false);
    });

    it('returns false when allowNoToken is false', () => {
      let result = shouldDisableVizzly({
        allowNoToken: false,
        hasApiKey: false,
        tdd: false,
      });

      expect(result).toBe(false);
    });
  });

  describe('determineBuildMode', () => {
    it('returns tdd when tdd is true', () => {
      expect(determineBuildMode(true)).toBe('tdd');
    });

    it('returns api when tdd is false', () => {
      expect(determineBuildMode(false)).toBe('api');
    });
  });

  describe('buildDisabledRunResult', () => {
    it('returns result with no failures and no screenshots', () => {
      let result = buildDisabledRunResult();

      expect(result).toEqual({
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

      expect(result).toEqual({
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

      expect(result).toEqual({
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

      expect(result.comparisons).toEqual(comparisons);
      expect(result.failed).toBe(true);
    });

    it('handles empty TDD results', () => {
      let result = buildRunResult({
        buildId: 'build-abc',
        buildUrl: null,
        testSuccess: true,
        screenshotCount: 0,
        tddResults: {},
      });

      expect(result.comparisons).toBeNull();
      expect(result.failed).toBe(false);
    });
  });

  describe('validateTestCommand', () => {
    it('returns valid for non-empty command', () => {
      let result = validateTestCommand('npm test');

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid for undefined command', () => {
      let result = validateTestCommand(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No test command provided');
    });

    it('returns invalid for empty string', () => {
      let result = validateTestCommand('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No test command provided');
    });

    it('returns invalid for null command', () => {
      let result = validateTestCommand(null);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateDaemonMode', () => {
    it('returns valid for TDD daemon mode', () => {
      let result = validateDaemonMode({ tdd: true, daemon: true });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid when tdd is false', () => {
      let result = validateDaemonMode({ tdd: false, daemon: true });

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        'Initialize method is only for TDD daemon mode'
      );
    });

    it('returns invalid when daemon is false', () => {
      let result = validateDaemonMode({ tdd: true, daemon: false });

      expect(result.valid).toBe(false);
    });

    it('returns invalid when both are false', () => {
      let result = validateDaemonMode({ tdd: false, daemon: false });

      expect(result.valid).toBe(false);
    });
  });

  describe('buildClientOptions', () => {
    it('builds options from config with API key', () => {
      let options = buildClientOptions({
        apiKey: 'test-key',
        apiUrl: 'https://api.example.com',
      });

      expect(options).toEqual({
        baseUrl: 'https://api.example.com',
        token: 'test-key',
        command: 'run',
      });
    });

    it('returns null when no API key', () => {
      let options = buildClientOptions({ apiUrl: 'https://api.example.com' });

      expect(options).toBeNull();
    });

    it('returns null for empty API key', () => {
      let options = buildClientOptions({
        apiKey: '',
        apiUrl: 'https://api.example.com',
      });

      expect(options).toBeNull();
    });

    it('returns null for undefined config', () => {
      let options = buildClientOptions(undefined);

      expect(options).toBeNull();
    });
  });

  describe('hasApiKey', () => {
    it('returns true when API key exists', () => {
      expect(hasApiKey({ apiKey: 'test-key' })).toBe(true);
    });

    it('returns false when no API key', () => {
      expect(hasApiKey({ apiUrl: 'https://api.example.com' })).toBe(false);
    });

    it('returns false for empty API key', () => {
      expect(hasApiKey({ apiKey: '' })).toBe(false);
    });

    it('returns false for undefined config', () => {
      expect(hasApiKey(undefined)).toBe(false);
    });
  });

  describe('buildSpawnOptions', () => {
    it('builds spawn options with environment', () => {
      let env = { NODE_ENV: 'test', VIZZLY_ENABLED: 'true' };
      let options = buildSpawnOptions(env);

      expect(options).toEqual({
        env,
        stdio: 'inherit',
        shell: true,
      });
    });

    it('builds spawn options with empty environment', () => {
      let options = buildSpawnOptions({});

      expect(options).toEqual({
        env: {},
        stdio: 'inherit',
        shell: true,
      });
    });
  });

  describe('normalizeSetBaseline', () => {
    it('returns true for camelCase setBaseline', () => {
      expect(normalizeSetBaseline({ setBaseline: true })).toBe(true);
    });

    it('returns true for kebab-case set-baseline', () => {
      expect(normalizeSetBaseline({ 'set-baseline': true })).toBe(true);
    });

    it('returns false when neither is set', () => {
      expect(normalizeSetBaseline({})).toBe(false);
    });

    it('returns false for undefined options', () => {
      expect(normalizeSetBaseline(undefined)).toBe(false);
    });

    it('returns false for null options', () => {
      expect(normalizeSetBaseline(null)).toBe(false);
    });

    it('returns true when both are set (camelCase takes precedence)', () => {
      expect(
        normalizeSetBaseline({ setBaseline: true, 'set-baseline': false })
      ).toBe(true);
    });
  });
});
