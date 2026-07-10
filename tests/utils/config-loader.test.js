import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  getScreenshotPaths,
  loadConfig,
} from '../../src/utils/config-loader.js';
import { saveGlobalConfig } from '../../src/utils/global-config.js';

describe('utils/config-loader', () => {
  describe('getScreenshotPaths', () => {
    it('returns default path when not configured', () => {
      let paths = getScreenshotPaths({});

      assert.strictEqual(paths.length, 1);
      assert.ok(paths[0].includes('screenshots'));
    });

    it('returns single path from string config', () => {
      let paths = getScreenshotPaths({
        upload: { screenshotsDir: './my-screenshots' },
      });

      assert.strictEqual(paths.length, 1);
      assert.ok(paths[0].includes('my-screenshots'));
    });

    it('returns multiple paths from array config', () => {
      let paths = getScreenshotPaths({
        upload: { screenshotsDir: ['./screenshots1', './screenshots2'] },
      });

      assert.strictEqual(paths.length, 2);
      assert.ok(paths[0].includes('screenshots1'));
      assert.ok(paths[1].includes('screenshots2'));
    });

    it('resolves paths relative to cwd', () => {
      let paths = getScreenshotPaths({
        upload: { screenshotsDir: './relative' },
      });

      assert.ok(paths[0].startsWith(process.cwd()));
    });
  });

  describe('loadConfig', () => {
    let testDir = join(process.cwd(), '.test-config-loader');
    let originalCwd = process.cwd();
    let originalEnv = {};

    beforeEach(() => {
      // Save original env vars
      originalEnv = {
        VIZZLY_TOKEN: process.env.VIZZLY_TOKEN,
        VIZZLY_API_URL: process.env.VIZZLY_API_URL,
        VIZZLY_BUILD_NAME: process.env.VIZZLY_BUILD_NAME,
        VIZZLY_PARALLEL_ID: process.env.VIZZLY_PARALLEL_ID,
        VIZZLY_THRESHOLD: process.env.VIZZLY_THRESHOLD,
        VIZZLY_MIN_CLUSTER_SIZE: process.env.VIZZLY_MIN_CLUSTER_SIZE,
        VIZZLY_HOME: process.env.VIZZLY_HOME,
      };

      // Clean env
      delete process.env.VIZZLY_TOKEN;
      delete process.env.VIZZLY_BUILD_NAME;
      delete process.env.VIZZLY_PARALLEL_ID;
      delete process.env.VIZZLY_THRESHOLD;
      delete process.env.VIZZLY_MIN_CLUSTER_SIZE;

      // Create test directory
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
      mkdirSync(testDir, { recursive: true });
      process.chdir(testDir);

      // Set VIZZLY_HOME to avoid reading real global config
      process.env.VIZZLY_HOME = join(testDir, '.vizzly-home');
    });

    afterEach(() => {
      process.chdir(originalCwd);
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }

      // Restore original env vars
      for (let [key, value] of Object.entries(originalEnv)) {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
    });

    it('returns default config when no config file exists', async () => {
      let config = await loadConfig();

      assert.strictEqual(config.server.port, 47392);
      assert.strictEqual(config.comparison.threshold, 2.0);
      assert.strictEqual(config.upload.screenshotsDir, './screenshots');
    });

    it('loads config from vizzly.config.js', async () => {
      writeFileSync(
        join(testDir, 'vizzly.config.js'),
        'export default { server: { port: 3000 }, comparison: { threshold: 1.5 } };'
      );

      let config = await loadConfig();

      assert.strictEqual(config.server.port, 3000);
      assert.strictEqual(config.comparison.threshold, 1.5);
    });

    it('applies CLI overrides', async () => {
      let config = await loadConfig(null, {
        token: 'cli-token',
        port: '5000',
        threshold: 0.5,
        minClusterSize: '4',
        buildName: 'My Build',
        environment: 'production',
      });

      assert.strictEqual(config.apiKey, 'cli-token');
      assert.strictEqual(config.server.port, 5000);
      assert.strictEqual(config.comparison.threshold, 0.5);
      assert.strictEqual(config.comparison.minClusterSize, 4);
      assert.strictEqual(config.build.name, 'My Build');
      assert.strictEqual(config.build.environment, 'production');
    });

    it('applies environment variable overrides', async () => {
      process.env.VIZZLY_TOKEN = 'env-token';
      process.env.VIZZLY_PARALLEL_ID = 'parallel-123';

      let config = await loadConfig();

      assert.strictEqual(config.apiKey, 'env-token');
      assert.strictEqual(config.parallelId, 'parallel-123');
    });

    it('applies comparison environment variable overrides', async () => {
      process.env.VIZZLY_THRESHOLD = '0';
      process.env.VIZZLY_MIN_CLUSTER_SIZE = '1';

      let config = await loadConfig();

      assert.strictEqual(config.comparison.threshold, 0);
      assert.strictEqual(config.comparison.minClusterSize, 1);
    });

    it('keeps user login separate from cloud upload credentials', async () => {
      await saveGlobalConfig({
        auth: {
          accessToken: 'user-access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2999-01-01T00:00:00.000Z',
        },
      });

      let config = await loadConfig();

      assert.strictEqual(config.apiKey, undefined);
      assert.strictEqual(config.userToken, 'user-access-token');
    });

    it('keeps an expired user access token available for API refresh', async () => {
      await saveGlobalConfig({
        auth: {
          accessToken: 'expired-user-access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2000-01-01T00:00:00.000Z',
        },
      });

      let config = await loadConfig();

      assert.strictEqual(config.userToken, 'expired-user-access-token');
    });

    it('uses the active linked project token for cloud upload credentials', async () => {
      await saveGlobalConfig({
        projectLink: {
          active: 'https://app.vizzly.dev|vizzly/storybook',
          links: {
            'https://app.vizzly.dev|vizzly/storybook': {
              apiUrl: 'https://app.vizzly.dev',
              organizationSlug: 'vizzly',
              projectSlug: 'storybook',
              tokenId: 'token-id',
              tokenPrefix: 'vzt_lin',
              storage: 'file',
              token: 'vzt_linked_secret',
            },
          },
        },
      });

      let config = await loadConfig();

      assert.strictEqual(config.apiKey, 'vzt_linked_secret');
      assert.strictEqual(config.linkedProject.organizationSlug, 'vizzly');
      assert.strictEqual(config.linkedProject.projectSlug, 'storybook');
    });

    it('applies VIZZLY_BUILD_NAME environment variable', async () => {
      process.env.VIZZLY_BUILD_NAME = 'CI Build #123';

      let config = await loadConfig();

      assert.strictEqual(config.build.name, 'CI Build #123');
    });

    it('CLI buildName overrides VIZZLY_BUILD_NAME', async () => {
      process.env.VIZZLY_BUILD_NAME = 'env-build-name';

      let config = await loadConfig(null, { buildName: 'cli-build-name' });

      assert.strictEqual(config.build.name, 'cli-build-name');
    });

    it('CLI token overrides env token', async () => {
      process.env.VIZZLY_TOKEN = 'env-token';

      let config = await loadConfig(null, { token: 'cli-token' });

      assert.strictEqual(config.apiKey, 'cli-token');
    });

    it('applies branch/commit/message overrides', async () => {
      let config = await loadConfig(null, {
        branch: 'feature-branch',
        commit: 'abc123',
        message: 'Test commit',
      });

      assert.strictEqual(config.build.branch, 'feature-branch');
      assert.strictEqual(config.build.commit, 'abc123');
      assert.strictEqual(config.build.message, 'Test commit');
    });

    it('applies timeout and batch size overrides', async () => {
      let config = await loadConfig(null, {
        timeout: '60000',
        batchSize: 20,
        uploadTimeout: 45000,
      });

      assert.strictEqual(config.server.timeout, 60000);
      assert.strictEqual(config.upload.batchSize, 20);
      assert.strictEqual(config.upload.timeout, 45000);
    });

    it('applies baseline overrides', async () => {
      let config = await loadConfig(null, {
        baselineBuild: 'build-123',
        baselineComparison: 'comparison-456',
      });

      assert.strictEqual(config.baselineBuildId, 'build-123');
      assert.strictEqual(config.baselineComparisonId, 'comparison-456');
    });

    it('applies behavior flags', async () => {
      let config = await loadConfig(null, {
        eager: true,
        wait: true,
        allowNoToken: true,
      });

      assert.strictEqual(config.eager, true);
      assert.strictEqual(config.wait, true);
      assert.strictEqual(config.allowNoToken, true);
    });

    it('applies parallelId override', async () => {
      let config = await loadConfig(null, {
        parallelId: 'parallel-from-cli',
      });

      assert.strictEqual(config.parallelId, 'parallel-from-cli');
    });
  });
});
