import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createVizzly, VizzlySDK } from '../../src/sdk/index.js';

describe('sdk/index', () => {
  describe('createVizzly', () => {
    it('returns an initialized VizzlySDK and lets explicit config win', async () => {
      let sdk = await createVizzly(
        {
          apiKey: 'explicit-token',
          server: { port: 6000 },
        },
        {
          loadConfig: async () => ({
            apiKey: 'file-token',
            apiUrl: 'https://from-config.example',
            server: { port: 3000 },
          }),
        }
      );

      assert.ok(sdk instanceof VizzlySDK);
      assert.deepStrictEqual(sdk.getConfig(), {
        apiKey: 'explicit-token',
        apiUrl: 'https://from-config.example',
        server: { port: 6000 },
      });
    });

    it('uses the current SDK config when creating services after config updates', async () => {
      let uploaderConfigs = [];
      let tddConfigs = [];
      let sdk = await createVizzly(
        {
          apiKey: 'initial-token',
          apiUrl: 'https://initial.example',
          upload: { screenshotsDir: './initial' },
        },
        {
          loadConfig: async () => ({}),
          createUploader: (config, options) => {
            uploaderConfigs.push({ config, options });
            return { upload: async () => ({ success: true }) };
          },
          createTDDService: (config, options) => {
            tddConfigs.push({ config, options });
            return { start: async () => ({ started: true }) };
          },
        }
      );

      sdk.updateConfig({
        apiKey: 'updated-token',
        apiUrl: 'https://updated.example',
        upload: { screenshotsDir: './updated' },
      });

      sdk.createUploader({ batchSize: 5 });
      sdk.createTDDService({ workingDir: '/tmp/vizzly' });

      assert.deepStrictEqual(uploaderConfigs[0].config, {
        apiKey: 'updated-token',
        apiUrl: 'https://updated.example',
        upload: { screenshotsDir: './updated' },
      });
      assert.equal(uploaderConfigs[0].options.batchSize, 5);
      assert.deepStrictEqual(tddConfigs[0].config, {
        apiKey: 'updated-token',
        apiUrl: 'https://updated.example',
        upload: { screenshotsDir: './updated' },
      });
      assert.equal(tddConfigs[0].options.workingDir, '/tmp/vizzly');
    });
  });

  describe('VizzlySDK server workflow', () => {
    it('updates config and creates SDK-owned services', async () => {
      let loadCount = 0;
      let uploaderOptions = [];
      let tddOptions = [];
      let startedTddOptions = null;
      let sdk = new VizzlySDK(
        {
          apiKey: 'runtime-token',
          upload: { screenshotsDir: './original' },
        },
        {
          loadConfig: async () => {
            loadCount += 1;
            return {
              apiUrl: 'https://from-file.example',
              upload: { screenshotsDir: './from-file' },
            };
          },
          createUploader: options => {
            uploaderOptions.push(options);
            return { upload: async () => ({ success: true }) };
          },
          createTDDService: options => {
            tddOptions.push(options);
            return {
              start: async startOptions => {
                startedTddOptions = startOptions;
                return { started: true };
              },
            };
          },
        }
      );

      assert.deepStrictEqual(
        sdk.updateConfig({ build: { environment: 'staging' } }),
        {
          apiKey: 'runtime-token',
          upload: { screenshotsDir: './original' },
          build: { environment: 'staging' },
        }
      );

      assert.deepStrictEqual(await sdk.init(), {
        apiKey: 'runtime-token',
        apiUrl: 'https://from-file.example',
        upload: { screenshotsDir: './original' },
        build: { environment: 'staging' },
      });
      assert.strictEqual(loadCount, 1);

      let uploader = sdk.createUploader({
        upload: { screenshotsDir: './override' },
        batchSize: 5,
      });
      let tddService = sdk.createTDDService({ workingDir: '/tmp/vizzly' });
      let tddStartResult = await sdk.startTDD({ setBaseline: true });

      assert.ok(uploader);
      assert.ok(tddService);
      assert.deepStrictEqual(uploaderOptions, [
        {
          upload: { screenshotsDir: './override' },
          batchSize: 5,
        },
      ]);
      assert.deepStrictEqual(tddOptions, [
        { workingDir: '/tmp/vizzly' },
        { setBaseline: true },
      ]);
      assert.deepStrictEqual(startedTddOptions, { setBaseline: true });
      assert.deepStrictEqual(tddStartResult, { started: true });
    });

    it('preserves exact-match threshold when uploading screenshots', async () => {
      let capturedUploadOptions = null;
      let sdk = new VizzlySDK(
        {
          threshold: 2.0,
          upload: { screenshotsDir: './screenshots' },
        },
        {
          createUploader: () => ({
            upload: async uploadOptions => {
              capturedUploadOptions = uploadOptions;
              return { buildId: 'build-123' };
            },
          }),
        }
      );

      let result = await sdk.upload({ threshold: 0 });

      assert.deepStrictEqual(result, { buildId: 'build-123' });
      assert.strictEqual(capturedUploadOptions.threshold, 0);
    });

    it('uses nested config defaults and forwards upload tracking options', async () => {
      let capturedUploadOptions = null;
      let sdk = new VizzlySDK(
        {
          build: {
            name: 'Config Build',
            branch: 'feature/config',
            commit: 'abc123',
            message: 'Config message',
            environment: 'staging',
          },
          comparison: {
            threshold: 2,
            minClusterSize: 4,
          },
          parallelId: 'config-parallel',
          upload: { screenshotsDir: './configured-screenshots' },
        },
        {
          createUploader: () => ({
            upload: async uploadOptions => {
              capturedUploadOptions = uploadOptions;
              return { buildId: 'build-123' };
            },
          }),
        }
      );

      await sdk.upload({
        metadata: { ci: 'github' },
        pullRequestNumber: 42,
      });

      assert.deepStrictEqual(capturedUploadOptions, {
        screenshotsDir: './configured-screenshots',
        buildName: 'Config Build',
        branch: 'feature/config',
        commit: 'abc123',
        message: 'Config message',
        environment: 'staging',
        threshold: 2,
        minClusterSize: 4,
        metadata: { ci: 'github' },
        pullRequestNumber: 42,
        parallelId: 'config-parallel',
        onProgress: capturedUploadOptions.onProgress,
      });
      assert.strictEqual(typeof capturedUploadOptions.onProgress, 'function');
    });

    it('starts once, captures screenshots through the local server, and stops', async () => {
      let running = false;
      let stopped = false;
      let fetchCalls = [];
      let startedEvents = [];
      let capturedEvents = [];
      let stoppedEvents = 0;
      let sdk = new VizzlySDK(
        { server: { port: 8123 } },
        {
          createScreenshotServer: () => ({
            async start() {
              running = true;
            },
            async stop() {
              stopped = true;
              running = false;
            },
            isRunning() {
              return running;
            },
          }),
          fetch: async (url, options) => {
            fetchCalls.push({ url, options });
            return { ok: true };
          },
        }
      );

      sdk.on('server:started', info => startedEvents.push(info));
      sdk.on('screenshot:captured', event => capturedEvents.push(event));
      sdk.on('server:stopped', () => {
        stoppedEvents += 1;
      });

      let serverInfo = await sdk.start();
      await sdk.screenshot('homepage', Buffer.from('image-data'), {
        buildId: 'build-1',
        properties: { browser: 'firefox' },
        threshold: 0,
        minClusterSize: 3,
        fullPage: true,
      });
      await sdk.stop();

      assert.deepStrictEqual(serverInfo, {
        port: 8123,
        url: 'http://localhost:8123',
      });
      assert.deepStrictEqual(startedEvents, [serverInfo]);
      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].url, 'http://localhost:8123/screenshot');
      assert.deepStrictEqual(JSON.parse(fetchCalls[0].options.body), {
        buildId: 'build-1',
        name: 'homepage',
        image: Buffer.from('image-data').toString('base64'),
        type: 'base64',
        properties: {
          browser: 'firefox',
          threshold: 0,
          minClusterSize: 3,
          fullPage: true,
        },
      });
      assert.deepStrictEqual(capturedEvents, [
        {
          name: 'homepage',
          buildId: 'build-1',
          options: {
            buildId: 'build-1',
            properties: { browser: 'firefox' },
            threshold: 0,
            minClusterSize: 3,
            fullPage: true,
          },
        },
      ]);
      assert.strictEqual(stopped, true);
      assert.strictEqual(stoppedEvents, 1);
    });

    it('fails clearly when screenshot is called before start', async () => {
      let sdk = new VizzlySDK({ server: { port: 8123 } }, {});

      await assert.rejects(
        () => sdk.screenshot('homepage', Buffer.from('image-data')),
        error =>
          error.code === 'SERVER_NOT_RUNNING' &&
          error.message.includes('Server not running')
      );
    });
  });
});
