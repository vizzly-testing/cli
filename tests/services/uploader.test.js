import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createUploader } from '../../src/services/uploader.js';

describe('services/uploader', () => {
  describe('createUploader', () => {
    it('creates uploader with default options', () => {
      let uploader = createUploader({
        apiKey: 'test-key',
        apiUrl: 'https://api.test',
      });

      assert.ok(uploader.upload);
      assert.ok(uploader.waitForBuild);
    });

    it('creates uploader with custom options', () => {
      let uploader = createUploader(
        {
          apiKey: 'test-key',
          apiUrl: 'https://api.test',
          userAgent: 'custom-agent',
          command: 'custom-cmd',
          upload: { batchSize: 20 },
        },
        { signal: new AbortController().signal }
      );

      assert.ok(uploader.upload);
      assert.ok(uploader.waitForBuild);
    });

    it('creates uploader with empty config', () => {
      let uploader = createUploader();

      assert.ok(uploader.upload);
      assert.ok(uploader.waitForBuild);
    });

    it('uses custom deps when provided', async () => {
      let mockClient = {
        request: async () => {
          return { build: { id: 'build-123' } };
        },
      };

      let uploader = createUploader(
        { apiKey: 'test-key', apiUrl: 'https://api.test' },
        {
          deps: {
            client: mockClient,
            createBuild: async () => ({ id: 'build-123' }),
            getDefaultBranch: () => 'main',
            glob: async () => [],
            readFile: async () => Buffer.from('test'),
            stat: async () => ({ size: 100 }),
            checkShas: async () => ({ existing: [], screenshots: [] }),
            createError: (msg, code) => {
              let err = new Error(msg);
              err.code = code;
              return err;
            },
            createValidationError: msg => new Error(msg),
            createUploadError: msg => new Error(msg),
            createTimeoutError: msg => new Error(msg),
            output: { debug: () => {}, info: () => {} },
          },
        }
      );

      assert.ok(uploader.upload);
    });
  });
});
