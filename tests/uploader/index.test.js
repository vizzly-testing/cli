import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createUploader } from '../../src/uploader/index.js';

async function withScreenshots(files, testFn) {
  let root = await mkdtemp(join(tmpdir(), 'vizzly-uploader-'));
  let screenshotsDir = join(root, 'screenshots');

  try {
    await mkdir(screenshotsDir);

    for (let [filename, contents] of Object.entries(files)) {
      await writeFile(join(screenshotsDir, filename), contents);
    }

    return await testFn(screenshotsDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createError(message, code, context) {
  let error = new Error(message);
  error.code = code;
  error.context = context;
  return error;
}

function createTestUploader(config = {}, deps = {}) {
  return createUploader(
    {
      apiKey: 'test-key',
      apiUrl: 'https://api.test',
      ...config,
    },
    {
      deps: {
        client: deps.client,
        createBuild: deps.createBuild || (async () => ({ id: 'build-123' })),
        getDefaultBranch: deps.getDefaultBranch || (async () => 'main'),
        glob: deps.glob,
        readFile,
        stat,
        checkShas: deps.checkShas || (async () => ({ existing: [] })),
        createError,
        createValidationError: createError,
        createUploadError: createError,
        createTimeoutError: createError,
        output: { debug: () => {} },
      },
      batchSize: deps.batchSize,
      timeout: deps.timeout,
      signal: deps.signal,
    }
  );
}

describe('uploader/createUploader', () => {
  it('uploads screenshots and reports the user-visible build result', async () => {
    await withScreenshots(
      {
        'home-chrome.png': Buffer.from('home'),
        'settings-firefox.png': Buffer.from('settings'),
      },
      async screenshotsDir => {
        let requests = [];
        let progress = [];
        let createdBuildInfo;
        let files = [
          join(screenshotsDir, 'home-chrome.png'),
          join(screenshotsDir, 'settings-firefox.png'),
        ];
        let client = {
          request: async (path, options) => {
            requests.push({ path, options });
            return {
              build: {
                id: 'build-123',
                url: 'https://app.test/builds/build-123',
              },
            };
          },
        };
        let uploader = createTestUploader(
          {},
          {
            client,
            glob: async () => files,
            createBuild: async (_client, buildInfo) => {
              createdBuildInfo = buildInfo;
              return { id: 'build-123' };
            },
          }
        );

        let result = await uploader.upload({
          screenshotsDir,
          buildName: 'Release screenshots',
          branch: 'feature/reports',
          environment: 'staging',
          onProgress: event => progress.push(event),
        });

        assert.deepEqual(result, {
          success: true,
          buildId: 'build-123',
          url: 'https://app.test/builds/build-123',
          stats: {
            total: 2,
            uploaded: 2,
            skipped: 0,
          },
        });
        assert.deepEqual(createdBuildInfo, {
          name: 'Release screenshots',
          branch: 'feature/reports',
          commit_sha: undefined,
          commit_message: undefined,
          environment: 'staging',
          threshold: undefined,
          github_pull_request_number: undefined,
          parallel_id: undefined,
        });
        assert.equal(requests.length, 1);
        assert.equal(requests[0].path, '/api/sdk/upload');
        assert.equal(requests[0].options.method, 'POST');
        assert.equal(requests[0].options.body.get('build_id'), 'build-123');
        assert.equal(requests[0].options.body.getAll('screenshots').length, 2);
        assert.deepEqual(
          progress.map(event => event.phase),
          ['scanning', 'processing', 'deduplication', 'uploading', 'completed']
        );
      }
    );
  });

  it('skips screenshot blobs that the API already has', async () => {
    await withScreenshots(
      {
        'home-chrome.png': Buffer.from('home'),
        'settings-firefox.png': Buffer.from('settings'),
      },
      async screenshotsDir => {
        let files = [
          join(screenshotsDir, 'home-chrome.png'),
          join(screenshotsDir, 'settings-firefox.png'),
        ];
        let checkedScreenshots;
        let uploadedFiles;
        let client = {
          request: async (_path, options) => {
            uploadedFiles = options.body.getAll('screenshots');
            return { url: 'https://app.test/builds/build-123' };
          },
        };
        let uploader = createTestUploader(
          {},
          {
            client,
            glob: async () => files,
            checkShas: async (_client, screenshots) => {
              checkedScreenshots = screenshots;
              return {
                existing: [screenshots[0].sha256],
                screenshots: [],
              };
            },
          }
        );

        let result = await uploader.upload({ screenshotsDir });

        assert.equal(checkedScreenshots.length, 2);
        assert.equal(uploadedFiles.length, 1);
        assert.equal(uploadedFiles[0].name, 'settings-firefox.png');
        assert.deepEqual(result.stats, {
          total: 2,
          uploaded: 1,
          skipped: 1,
        });
      }
    );
  });

  it('waits for a completed build response', async () => {
    let client = {
      request: async path => {
        assert.equal(path, '/api/sdk/builds/build-123');
        return {
          build: {
            id: 'build-123',
            status: 'completed',
            url: 'https://app.test/builds/build-123',
            comparisonsTotal: 3,
            comparisonsPassed: 2,
            comparisonsFailed: 1,
          },
        };
      },
    };
    let uploader = createTestUploader({}, { client });

    let result = await uploader.waitForBuild('build-123');

    assert.equal(result.status, 'completed');
    assert.equal(result.url, 'https://app.test/builds/build-123');
    assert.equal(result.comparisons, 3);
    assert.equal(result.passedComparisons, 2);
    assert.equal(result.failedComparisons, 1);
  });

  it('surfaces missing API keys before touching the screenshot directory', async () => {
    let statCalled = false;
    let uploader = createUploader(
      { apiUrl: 'https://api.test' },
      {
        deps: {
          client: { request: async () => ({}) },
          createBuild: async () => ({ id: 'build-123' }),
          getDefaultBranch: async () => 'main',
          glob: async () => [],
          readFile,
          stat: async () => {
            statCalled = true;
          },
          checkShas: async () => ({ existing: [] }),
          createError,
          createValidationError: createError,
          createUploadError: createError,
          createTimeoutError: createError,
          output: { debug: () => {} },
        },
      }
    );

    await assert.rejects(
      () => uploader.upload({ screenshotsDir: '/not-used' }),
      error => {
        assert.equal(error.message, 'API key is required');
        return true;
      }
    );
    assert.equal(statCalled, false);
  });
});
