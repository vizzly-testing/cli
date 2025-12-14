import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  checkExistingFiles,
  findScreenshots,
  processFiles,
  uploadFiles,
  waitForBuild,
} from '../../src/uploader/operations.js';

describe('uploader/operations', () => {
  describe('findScreenshots', () => {
    it('finds PNG files in directory', async () => {
      let globPattern = null;
      let globOpts = null;

      let deps = {
        glob: async (pattern, opts) => {
          globPattern = pattern;
          globOpts = opts;
          return ['/screenshots/test1.png', '/screenshots/test2.png'];
        },
      };

      let result = await findScreenshots({
        directory: '/screenshots',
        deps,
      });

      assert.ok(globPattern.includes('*.png'));
      assert.strictEqual(globOpts.absolute, true);
      assert.deepStrictEqual(result, [
        '/screenshots/test1.png',
        '/screenshots/test2.png',
      ]);
    });
  });

  describe('processFiles', () => {
    it('processes files and builds metadata', async () => {
      let progressCalls = [];

      let deps = {
        readFile: async filePath => Buffer.from(`content-${filePath}`),
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      let result = await processFiles({
        files: ['/test/one.png', '/test/two.png'],
        signal: { aborted: false },
        onProgress: count => progressCalls.push(count),
        deps,
      });

      assert.strictEqual(result.length, 2);
      assert.ok(result[0].sha256);
      assert.ok(result[0].buffer);
      assert.ok(result[0].filename);
      assert.deepStrictEqual(progressCalls, [2]); // Called at end
    });

    it('throws when signal is aborted', async () => {
      let deps = {
        readFile: async () => Buffer.from('content'),
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      await assert.rejects(
        () =>
          processFiles({
            files: ['/test/one.png'],
            signal: { aborted: true },
            onProgress: () => {},
            deps,
          }),
        error => {
          assert.strictEqual(error.code, 'UPLOAD_CANCELLED');
          return true;
        }
      );
    });

    it('reports progress every 10 files', async () => {
      let progressCalls = [];
      let fileCount = 25;
      let files = Array.from({ length: fileCount }, (_, i) => `/test/${i}.png`);

      let deps = {
        readFile: async () => Buffer.from('content'),
        createError: () => new Error(),
      };

      await processFiles({
        files,
        signal: { aborted: false },
        onProgress: count => progressCalls.push(count),
        deps,
      });

      // Should call at 10, 20, 25
      assert.deepStrictEqual(progressCalls, [10, 20, 25]);
    });
  });

  describe('checkExistingFiles', () => {
    it('partitions files by SHA existence', async () => {
      let deps = {
        checkShas: async () => ({
          existing: ['sha-1'],
          screenshots: [{ sha256: 'sha-1', id: 'record-1' }],
        }),
        createError: () => new Error(),
        output: { debug: () => {} },
      };

      let fileMetadata = [
        { sha256: 'sha-1', filename: 'existing.png' },
        { sha256: 'sha-2', filename: 'new.png' },
      ];

      let result = await checkExistingFiles({
        fileMetadata,
        client: {},
        signal: { aborted: false },
        buildId: 'build-123',
        deps,
      });

      assert.strictEqual(result.existing.length, 1);
      assert.strictEqual(result.toUpload.length, 1);
      assert.strictEqual(result.toUpload[0].sha256, 'sha-2');
      assert.strictEqual(result.screenshots.length, 1);
    });

    it('throws when signal is aborted', async () => {
      let deps = {
        checkShas: async () => ({ existing: [], screenshots: [] }),
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        output: { debug: () => {} },
      };

      await assert.rejects(
        () =>
          checkExistingFiles({
            fileMetadata: [{ sha256: 'sha-1' }],
            client: {},
            signal: { aborted: true },
            buildId: 'build-123',
            deps,
          }),
        error => {
          assert.strictEqual(error.code, 'UPLOAD_CANCELLED');
          return true;
        }
      );
    });

    it('continues without deduplication on checkShas error', async () => {
      let debugCalled = false;

      let deps = {
        checkShas: async () => {
          throw new Error('API error');
        },
        createError: () => new Error(),
        output: {
          debug: () => {
            debugCalled = true;
          },
        },
      };

      let fileMetadata = [{ sha256: 'sha-1', filename: 'test.png' }];

      let result = await checkExistingFiles({
        fileMetadata,
        client: {},
        signal: { aborted: false },
        buildId: 'build-123',
        deps,
      });

      assert.strictEqual(debugCalled, true);
      assert.strictEqual(result.toUpload.length, 1);
      assert.strictEqual(result.existing.length, 0);
    });

    it('handles null response from checkShas', async () => {
      let deps = {
        checkShas: async () => null,
        createError: () => new Error(),
        output: { debug: () => {} },
      };

      let fileMetadata = [{ sha256: 'sha-1', filename: 'test.png' }];

      let result = await checkExistingFiles({
        fileMetadata,
        client: {},
        signal: { aborted: false },
        buildId: 'build-123',
        deps,
      });

      assert.strictEqual(result.toUpload.length, 1);
    });
  });

  describe('uploadFiles', () => {
    it('returns early when nothing to upload', async () => {
      let result = await uploadFiles({
        toUpload: [],
        buildId: 'build-123',
        client: {},
        signal: { aborted: false },
        batchSize: 10,
        onProgress: () => {},
        deps: { createError: () => new Error() },
      });

      assert.strictEqual(result.buildId, 'build-123');
      assert.strictEqual(result.url, null);
    });

    it('uploads files in batches', async () => {
      let requestCalls = [];
      let progressCalls = [];

      let mockClient = {
        request: async (endpoint, opts) => {
          requestCalls.push({ endpoint, body: opts.body });
          return { build: { url: 'https://app.vizzly.dev/builds/123' } };
        },
      };

      let toUpload = [
        { buffer: Buffer.from('img1'), filename: 'test1.png' },
        { buffer: Buffer.from('img2'), filename: 'test2.png' },
        { buffer: Buffer.from('img3'), filename: 'test3.png' },
      ];

      let result = await uploadFiles({
        toUpload,
        buildId: 'build-123',
        client: mockClient,
        signal: { aborted: false },
        batchSize: 2,
        onProgress: count => progressCalls.push(count),
        deps: { createError: () => new Error() },
      });

      assert.strictEqual(requestCalls.length, 2); // 2 batches
      assert.strictEqual(requestCalls[0].endpoint, '/api/sdk/upload');
      assert.deepStrictEqual(progressCalls, [2, 3]);
      assert.strictEqual(result.url, 'https://app.vizzly.dev/builds/123');
    });

    it('throws when signal is aborted', async () => {
      let deps = {
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      await assert.rejects(
        () =>
          uploadFiles({
            toUpload: [{ buffer: Buffer.from('img'), filename: 'test.png' }],
            buildId: 'build-123',
            client: {},
            signal: { aborted: true },
            batchSize: 10,
            onProgress: () => {},
            deps,
          }),
        error => {
          assert.strictEqual(error.code, 'UPLOAD_CANCELLED');
          return true;
        }
      );
    });

    it('throws on upload error', async () => {
      let mockClient = {
        request: async () => {
          throw new Error('Network error');
        },
      };

      let deps = {
        createError: (msg, code, context) => {
          let err = new Error(msg);
          err.code = code;
          err.context = context;
          return err;
        },
      };

      await assert.rejects(
        () =>
          uploadFiles({
            toUpload: [{ buffer: Buffer.from('img'), filename: 'test.png' }],
            buildId: 'build-123',
            client: mockClient,
            signal: { aborted: false },
            batchSize: 10,
            onProgress: () => {},
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Upload failed'));
          assert.strictEqual(error.code, 'UPLOAD_FAILED');
          return true;
        }
      );
    });
  });

  describe('waitForBuild', () => {
    it('returns immediately when build is completed', async () => {
      let mockClient = {
        request: async () => ({
          build: {
            status: 'completed',
            id: 'build-123',
            url: 'https://app.vizzly.dev/builds/123',
          },
        }),
      };

      let deps = {
        createError: () => new Error(),
        createTimeoutError: () => new Error(),
      };

      let result = await waitForBuild({
        buildId: 'build-123',
        timeout: 30000,
        signal: { aborted: false },
        client: mockClient,
        deps,
      });

      assert.strictEqual(result.status, 'completed');
      assert.ok(result.build);
    });

    it('throws when build status is failed', async () => {
      let mockClient = {
        request: async () => ({
          build: {
            status: 'failed',
            error: 'Build processing error',
          },
        }),
      };

      let deps = {
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        createTimeoutError: () => new Error(),
      };

      await assert.rejects(
        () =>
          waitForBuild({
            buildId: 'build-123',
            timeout: 30000,
            signal: { aborted: false },
            client: mockClient,
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Build failed'));
          assert.strictEqual(error.code, 'BUILD_FAILED');
          return true;
        }
      );
    });

    it('throws when signal is aborted', async () => {
      let mockClient = {
        request: async () => ({ build: { status: 'processing' } }),
      };

      let deps = {
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        createTimeoutError: () => new Error(),
      };

      await assert.rejects(
        () =>
          waitForBuild({
            buildId: 'build-123',
            timeout: 30000,
            signal: { aborted: true },
            client: mockClient,
            deps,
          }),
        error => {
          assert.strictEqual(error.code, 'UPLOAD_CANCELLED');
          return true;
        }
      );
    });

    it('throws on API request error', async () => {
      let mockClient = {
        request: async () => {
          throw new Error('status 500');
        },
      };

      let deps = {
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        createTimeoutError: () => new Error(),
      };

      await assert.rejects(
        () =>
          waitForBuild({
            buildId: 'build-123',
            timeout: 30000,
            signal: { aborted: false },
            client: mockClient,
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Failed to check build status'));
          assert.strictEqual(error.code, 'BUILD_STATUS_FAILED');
          return true;
        }
      );
    });

    it('handles response without build wrapper', async () => {
      let mockClient = {
        request: async () => ({
          status: 'completed',
          id: 'build-123',
          url: 'https://app.vizzly.dev/builds/123',
        }),
      };

      let deps = {
        createError: () => new Error(),
        createTimeoutError: () => new Error(),
      };

      let result = await waitForBuild({
        buildId: 'build-123',
        timeout: 30000,
        signal: { aborted: false },
        client: mockClient,
        deps,
      });

      assert.strictEqual(result.status, 'completed');
    });
  });
});
