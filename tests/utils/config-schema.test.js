import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  validateVizzlyConfig,
  validateVizzlyConfigWithDefaults,
  vizzlyConfigSchema,
} from '../../src/utils/config-schema.js';

describe('utils/config-schema', () => {
  describe('vizzlyConfigSchema', () => {
    it('provides default values when parsing empty object', () => {
      let result = vizzlyConfigSchema.parse({});

      assert.strictEqual(result.server.port, 47392);
      assert.strictEqual(result.server.timeout, 30000);
      assert.strictEqual(result.build.name, 'Build {timestamp}');
      assert.strictEqual(result.build.environment, 'test');
      assert.strictEqual(result.upload.screenshotsDir, './screenshots');
      assert.strictEqual(result.upload.batchSize, 10);
      assert.strictEqual(result.comparison.threshold, 2.0);
      assert.strictEqual(result.comparison.minClusterSize, 2);
      assert.strictEqual(result.tdd.openReport, false);
      assert.deepStrictEqual(result.plugins, []);
    });

    it('accepts custom server config', () => {
      let result = vizzlyConfigSchema.parse({
        server: { port: 8080, timeout: 60000 },
      });

      assert.strictEqual(result.server.port, 8080);
      assert.strictEqual(result.server.timeout, 60000);
    });

    it('accepts custom build config', () => {
      let result = vizzlyConfigSchema.parse({
        build: {
          name: 'My Build',
          environment: 'production',
          branch: 'main',
          commit: 'abc123',
        },
      });

      assert.strictEqual(result.build.name, 'My Build');
      assert.strictEqual(result.build.environment, 'production');
      assert.strictEqual(result.build.branch, 'main');
      assert.strictEqual(result.build.commit, 'abc123');
    });

    it('accepts array of screenshot directories', () => {
      let result = vizzlyConfigSchema.parse({
        upload: { screenshotsDir: ['./screenshots', './e2e/snapshots'] },
      });

      assert.deepStrictEqual(result.upload.screenshotsDir, [
        './screenshots',
        './e2e/snapshots',
      ]);
    });

    it('validates apiUrl as URL', () => {
      let result = vizzlyConfigSchema.parse({
        apiUrl: 'https://custom.vizzly.dev',
      });

      assert.strictEqual(result.apiUrl, 'https://custom.vizzly.dev');
    });

    it('allows plugin-specific keys via passthrough', () => {
      let result = vizzlyConfigSchema.parse({
        staticSite: { baseUrl: 'http://localhost:3000' },
        storybook: { url: 'http://localhost:6006' },
      });

      assert.deepStrictEqual(result.staticSite, {
        baseUrl: 'http://localhost:3000',
      });
      assert.deepStrictEqual(result.storybook, {
        url: 'http://localhost:6006',
      });
    });

    it('accepts optional fields', () => {
      let result = vizzlyConfigSchema.parse({
        parallelId: 'parallel-123',
        baselineBuildId: 'build-456',
        eager: true,
        wait: true,
        allowNoToken: true,
      });

      assert.strictEqual(result.parallelId, 'parallel-123');
      assert.strictEqual(result.baselineBuildId, 'build-456');
      assert.strictEqual(result.eager, true);
      assert.strictEqual(result.wait, true);
      assert.strictEqual(result.allowNoToken, true);
    });
  });

  describe('validateVizzlyConfig', () => {
    it('validates and returns config', () => {
      let result = validateVizzlyConfig({
        build: { name: 'Test Build', environment: 'ci' },
      });

      assert.strictEqual(result.build.name, 'Test Build');
      assert.strictEqual(result.build.environment, 'ci');
    });

    it('throws descriptive error for invalid config', () => {
      assert.throws(
        () => validateVizzlyConfig({ server: { port: -1 } }),
        error => {
          assert.ok(error.message.includes('Invalid Vizzly configuration'));
          assert.ok(error.message.includes('vizzly.config.js'));
          return true;
        }
      );
    });

    it('throws error for invalid apiUrl', () => {
      assert.throws(
        () => validateVizzlyConfig({ apiUrl: 'not-a-url' }),
        error => {
          assert.ok(error.message.includes('Invalid Vizzly configuration'));
          return true;
        }
      );
    });
  });

  describe('validateVizzlyConfigWithDefaults', () => {
    it('returns defaults for null config', () => {
      let result = validateVizzlyConfigWithDefaults(null);

      assert.strictEqual(result.server.port, 47392);
      assert.strictEqual(result.build.environment, 'test');
    });

    it('returns defaults for undefined config', () => {
      let result = validateVizzlyConfigWithDefaults(undefined);

      assert.strictEqual(result.server.port, 47392);
    });

    it('validates provided config', () => {
      let result = validateVizzlyConfigWithDefaults({
        server: { port: 9000, timeout: 10000 },
      });

      assert.strictEqual(result.server.port, 9000);
    });
  });
});
