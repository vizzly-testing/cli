import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  resolveBuildDisplayUrl,
  validateRunOptions,
} from '../../src/commands/run.js';

function createConfig(overrides = {}) {
  return {
    apiKey: 'test-token',
    apiUrl: 'https://api.test',
    ...overrides,
  };
}

describe('commands/run', () => {
  describe('resolveBuildDisplayUrl', () => {
    it('uses the URL returned by the API', async () => {
      let url = await resolveBuildDisplayUrl({
        result: {
          buildId: 'build-123',
          url: 'https://app.test/acme/web/builds/build-123',
        },
        config: createConfig(),
        createApiClient: () => {
          throw new Error('should not fetch token context');
        },
      });

      assert.strictEqual(url, 'https://app.test/acme/web/builds/build-123');
    });

    it('builds an organization/project URL from token context', async () => {
      let url = await resolveBuildDisplayUrl({
        result: { buildId: 'build-123' },
        config: createConfig({ apiUrl: 'https://api.test/api/v1' }),
        createApiClient: () => ({}),
        getTokenContext: async () => ({
          organization: { slug: 'acme' },
          project: { slug: 'web' },
        }),
      });

      assert.strictEqual(url, 'https://api.test/acme/web/builds/build-123');
    });

    it('falls back to the app build URL when token context is unavailable', async () => {
      let url = await resolveBuildDisplayUrl({
        result: { buildId: 'build-123' },
        config: createConfig({ apiUrl: 'https://api.test/api/v1' }),
        createApiClient: () => ({ client: true }),
        getTokenContext: async () => {
          throw new Error('context unavailable');
        },
      });

      assert.strictEqual(url, 'https://api.test/builds/build-123');
    });

    it('returns no URL when there is no API token or result URL', async () => {
      let url = await resolveBuildDisplayUrl({
        result: { buildId: 'build-123' },
        config: createConfig({ apiKey: null }),
      });

      assert.strictEqual(url, undefined);
    });
  });

  describe('validateRunOptions', () => {
    it('accepts a valid command and run configuration', () => {
      let errors = validateRunOptions('pnpm test', {
        port: '3000',
        timeout: '5000',
        batchSize: '10',
        uploadTimeout: '30000',
        threshold: '0',
        minClusterSize: '1',
      });

      assert.deepStrictEqual(errors, []);
    });

    it('reports invalid command, port, and timeout values', () => {
      let errors = validateRunOptions('', {
        port: 'invalid',
        timeout: '500',
      });

      assert.deepStrictEqual(errors, [
        'Test command is required',
        'Port must be a valid number between 1 and 65535',
        'Timeout must be at least 1000 milliseconds',
      ]);
    });

    it('rejects non-integer batch and upload timeout values', () => {
      let errors = validateRunOptions('pnpm test', {
        batchSize: '2.5',
        uploadTimeout: '0',
      });

      assert.deepStrictEqual(errors, [
        'Batch size must be a positive integer',
        'Upload timeout must be a positive integer (milliseconds)',
      ]);
    });

    it('rejects invalid comparison thresholds and cluster sizes', () => {
      let errors = validateRunOptions('pnpm test', {
        threshold: '2abc',
        minClusterSize: '2.5',
      });

      assert.deepStrictEqual(errors, [
        'Threshold must be a non-negative number (CIEDE2000 Delta E)',
        'Min cluster size must be a positive integer',
      ]);
    });
  });
});
