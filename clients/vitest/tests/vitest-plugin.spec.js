/**
 * Integration tests for Vitest plugin
 *
 * These tests verify the @vizzly-testing/vitest package works correctly
 * with Vitest's browser mode and screenshot comparator API.
 *
 * These run in Node environment to test the Vite plugin configuration.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildScreenshotCaptureOptions,
  buildScreenshotProperties,
  detectBrowser,
  isElementScreenshotTarget,
  normalizeScreenshotMatcherArgs,
  shouldFailOnDiff,
} from '../src/setup.js';

describe('Vitest Plugin Integration', () => {
  describe('Plugin Configuration', () => {
    it('should register setup file', async () => {
      let { vizzlyPlugin } = await import('../src/index.js');

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config, { mode: 'test' });

      expect(config.test.setupFiles).toBeDefined();
      expect(Array.isArray(config.test.setupFiles)).toBe(true);
      expect(
        config.test.setupFiles.some(file => file.includes('setup.js'))
      ).toBe(true);
    });

    it('should not duplicate user setupFiles (vitest merges them automatically)', async () => {
      let { vizzlyPlugin } = await import('../src/index.js');

      // Simulate user config with existing setupFiles
      let userConfig = {
        test: {
          setupFiles: ['./user-setup.js', './another-setup.js'],
        },
      };

      let plugin = vizzlyPlugin();
      let pluginConfig = plugin.config(userConfig, { mode: 'test' });

      // Plugin should ONLY return its own setup file
      // Vitest handles merging user config with plugin config
      // If plugin spreads ...setupFiles, user's files would run twice after Vitest merges
      expect(pluginConfig.test.setupFiles).toHaveLength(1);
      expect(pluginConfig.test.setupFiles[0]).toContain('setup.js');

      // Verify user's files are NOT in plugin's returned config
      // (they'll be merged by Vitest from the original user config)
      expect(
        pluginConfig.test.setupFiles.some(f => f.includes('user-setup'))
      ).toBe(false);
    });

    it('should not duplicate user setupFiles when given as string', async () => {
      let { vizzlyPlugin } = await import('../src/index.js');

      // User might specify setupFiles as a single string
      let userConfig = {
        test: {
          setupFiles: './user-setup.js',
        },
      };

      let plugin = vizzlyPlugin();
      let pluginConfig = plugin.config(userConfig, { mode: 'test' });

      // Plugin should still only return its own setup file
      expect(pluginConfig.test.setupFiles).toHaveLength(1);
      expect(pluginConfig.test.setupFiles[0]).toContain('setup.js');
    });

    it('should result in correct merged config after vitest merging', async () => {
      let { vizzlyPlugin } = await import('../src/index.js');

      let userConfig = {
        test: {
          setupFiles: ['./user-setup.js'],
        },
      };

      let plugin = vizzlyPlugin();
      let pluginConfig = plugin.config(userConfig, { mode: 'test' });

      // Simulate Vitest's merging behavior
      let mergedSetupFiles = [
        ...(userConfig.test.setupFiles || []),
        ...(pluginConfig.test.setupFiles || []),
      ];

      // Should have exactly 2 files (user's + plugin's), not 3
      expect(mergedSetupFiles).toHaveLength(2);
      expect(mergedSetupFiles).toContain('./user-setup.js');
      expect(mergedSetupFiles.some(f => f.includes('setup.js'))).toBe(true);
    });

    it('should pass environment variables to browser context', async () => {
      let { vizzlyPlugin } = await import('../src/index.js');

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config, { mode: 'test' });

      expect(config.define).toBeDefined();
      expect(config.define.__VIZZLY_SERVER_URL__).toBeDefined();
      expect(config.define.__VIZZLY_BUILD_ID__).toBeDefined();
      expect(config.define.__VIZZLY_FAIL_ON_DIFF__).toBeDefined();
    });

    it('should pass failOnDiff from discovered server config', async () => {
      let { vizzlyPlugin } = await import('../src/index.js');
      let originalCwd = process.cwd();
      let tempDir = mkdtempSync(resolve(tmpdir(), 'vizzly-vitest-'));
      let originalServerUrl = process.env.VIZZLY_SERVER_URL;
      let originalFailOnDiff = process.env.VIZZLY_FAIL_ON_DIFF;

      delete process.env.VIZZLY_SERVER_URL;
      delete process.env.VIZZLY_FAIL_ON_DIFF;
      mkdirSync(resolve(tempDir, '.vizzly'));
      writeFileSync(
        resolve(tempDir, '.vizzly/server.json'),
        JSON.stringify({ port: 47392, failOnDiff: true })
      );

      try {
        process.chdir(tempDir);
        let plugin = vizzlyPlugin();
        let config = plugin.config({ test: {} }, { mode: 'test' });

        expect(JSON.parse(config.define.__VIZZLY_SERVER_URL__)).toBe(
          'http://localhost:47392'
        );
        expect(JSON.parse(config.define.__VIZZLY_FAIL_ON_DIFF__)).toBe('true');
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });

        if (originalServerUrl === undefined) {
          delete process.env.VIZZLY_SERVER_URL;
        } else {
          process.env.VIZZLY_SERVER_URL = originalServerUrl;
        }

        if (originalFailOnDiff === undefined) {
          delete process.env.VIZZLY_FAIL_ON_DIFF;
        } else {
          process.env.VIZZLY_FAIL_ON_DIFF = originalFailOnDiff;
        }
      }
    });
  });

  describe('Custom Matcher', () => {
    it('sends comparison options as screenshot properties', () => {
      let properties = buildScreenshotProperties(
        {
          properties: { theme: 'dark' },
          threshold: 5,
          minClusterSize: 10,
          fullPage: true,
        },
        'http://localhost/component',
        { viewport: { width: 1920, height: 1080 } }
      );

      expect(properties).toEqual({
        framework: 'vitest',
        vitest: true,
        url: 'http://localhost/component',
        browser: 'unknown',
        viewport: { width: 1920, height: 1080 },
        viewport_width: 1920,
        viewport_height: 1080,
        theme: 'dark',
        threshold: 5,
        minClusterSize: 10,
        fullPage: true,
      });
    });

    it('keeps reserved screenshot metadata stable while preserving viewport overrides', () => {
      let properties = buildScreenshotProperties(
        {
          properties: {
            browser: 'webkit',
            framework: 'custom-framework',
            url: 'http://evil.example',
            vitest: false,
            viewport: { width: 375, height: 667 },
            viewport_width: 375,
            viewport_height: 667,
          },
        },
        'http://localhost/component',
        { viewport: { width: 1920, height: 1080 } }
      );

      expect(properties).toMatchObject({
        framework: 'vitest',
        vitest: true,
        url: 'http://localhost/component',
        browser: 'unknown',
        viewport: { width: 375, height: 667 },
        viewport_width: 375,
        viewport_height: 667,
      });
    });

    it('normalizes browser metadata for screenshot signatures', () => {
      expect(
        detectBrowser(
          'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
        )
      ).toBe('chromium');
      expect(detectBrowser('Mozilla/5.0 Firefox/127.0')).toBe('firefox');
      expect(
        detectBrowser('Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari')
      ).toBe('webkit');
    });

    it('does not pass Vizzly-only options to browser screenshots', () => {
      let captureOptions = buildScreenshotCaptureOptions({
        properties: { theme: 'dark' },
        threshold: 5,
        minClusterSize: 10,
        failOnDiff: true,
        buildId: 'build-from-env',
        requestTimeout: 30_000,
        fullPage: true,
        animations: 'disabled',
      });

      expect(captureOptions).toEqual({
        fullPage: true,
        animations: 'disabled',
      });
    });

    it('lets per-screenshot failOnDiff override the server setting', () => {
      expect(shouldFailOnDiff(true)).toBe(true);
      expect(shouldFailOnDiff(false)).toBe(false);
    });

    it('does not pass fullPage to element screenshots', () => {
      let captureOptions = buildScreenshotCaptureOptions(
        {
          fullPage: true,
          animations: 'disabled',
        },
        { element: true }
      );

      expect(captureOptions).toEqual({
        animations: 'disabled',
      });
    });

    it('does not mark element screenshots as full page in Vizzly properties', () => {
      let properties = buildScreenshotProperties(
        { fullPage: true, properties: { state: 'open' } },
        'http://localhost/component',
        { element: true }
      );

      expect(properties).toEqual({
        framework: 'vitest',
        vitest: true,
        url: 'http://localhost/component',
        browser: 'unknown',
        state: 'open',
      });
    });

    it('lets explicit user viewport properties override detected viewport metadata', () => {
      let properties = buildScreenshotProperties(
        {
          properties: {
            viewport: { width: 375, height: 667 },
            viewport_width: 375,
            viewport_height: 667,
          },
        },
        'http://localhost/component',
        { viewport: { width: 1920, height: 1080 } }
      );

      expect(properties).toMatchObject({
        viewport: { width: 375, height: 667 },
        viewport_width: 375,
        viewport_height: 667,
      });
    });

    it('detects Vitest locator-style element screenshot targets', () => {
      let page = { screenshot: async () => '/tmp/page.png' };
      let locator = { screenshot: async () => '/tmp/button.png' };

      expect(isElementScreenshotTarget(locator, page)).toBe(true);
      expect(isElementScreenshotTarget(page, page)).toBe(false);
    });

    it('supports Vitest options-only matcher arguments', () => {
      expect(
        normalizeScreenshotMatcherArgs({ properties: { state: 'open' } })
      ).toEqual({
        name: undefined,
        options: { properties: { state: 'open' } },
      });

      expect(
        normalizeScreenshotMatcherArgs('menu-open', {
          properties: { state: 'open' },
        })
      ).toEqual({
        name: 'menu-open',
        options: { properties: { state: 'open' } },
      });
    });

    it('should not export toMatchScreenshot (registered via setup.js)', async () => {
      let exports = await import('../src/index.js');

      // toMatchScreenshot is registered via expect.extend() in setup.js, not exported
      expect(exports.toMatchScreenshot).toBeUndefined();
    });
  });

  describe('TypeScript Declarations', () => {
    it('should have valid TypeScript declarations', () => {
      let dtsPath = resolve(process.cwd(), 'src/index.d.ts');
      expect(existsSync(dtsPath)).toBe(true);

      let content = readFileSync(dtsPath, 'utf-8');
      // Check for core exports
      expect(content).toContain('export function vizzlyPlugin');
      expect(content).toContain('export function getVizzlyStatus');
      // Note: toMatchScreenshot is defined in setup.js, not in index.d.ts
    });
  });

  describe('Package Configuration', () => {
    let pkgPath = resolve(process.cwd(), 'package.json');
    let pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    it('should have correct package.json exports', () => {
      expect(pkg.type).toBe('module');
      expect(pkg.exports['.']).toBeDefined();
      expect(pkg.exports['.'].import).toBe('./src/index.js');
      expect(pkg.exports['.'].types).toBe('./src/index.d.ts');
    });

    it('should have no runtime dependencies', () => {
      // Vitest plugin has no runtime dependencies - everything runs in browser context
      expect(Object.keys(pkg.dependencies || {})).toHaveLength(0);
    });

    it('should have correct peer dependencies', () => {
      expect(pkg.peerDependencies).toHaveProperty('@vizzly-testing/cli');
      expect(pkg.peerDependencies).toHaveProperty('vitest');
    });
  });

  describe('Helper Functions', () => {
    it('should export getVizzlyStatus', async () => {
      let { getVizzlyStatus } = await import('../src/index.js');

      expect(typeof getVizzlyStatus).toBe('function');

      let status = getVizzlyStatus();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('ready');
    });

    it('should re-export getVizzlyInfo', async () => {
      let { getVizzlyInfo } = await import('../src/index.js');

      expect(typeof getVizzlyInfo).toBe('function');
    });
  });
});
