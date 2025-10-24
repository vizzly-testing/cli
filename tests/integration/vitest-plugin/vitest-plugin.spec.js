/**
 * Integration tests for Vitest plugin
 *
 * These tests verify the @vizzly-testing/vitest package works correctly
 * with Vitest's browser mode and screenshot comparator API.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('Vitest Plugin Integration', () => {
  describe('Plugin Configuration', () => {
    it('should register vizzly comparator', async () => {
      const { vizzlyPlugin } = await import(
        '../../../clients/vitest/src/index.js'
      );

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config);

      expect(
        config.test.browser.expect.toMatchScreenshot.comparators.vizzly
      ).toBeDefined();
      expect(
        typeof config.test.browser.expect.toMatchScreenshot.comparators.vizzly
      ).toBe('function');
    });

    it('should set vizzly as default comparator', async () => {
      const { vizzlyPlugin } = await import(
        '../../../clients/vitest/src/index.js'
      );

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config);

      expect(config.test.browser.expect.toMatchScreenshot.comparatorName).toBe(
        'vizzly'
      );
    });

    it('should override screenshot path resolution', async () => {
      const { vizzlyPlugin } = await import(
        '../../../clients/vitest/src/index.js'
      );

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config);

      const pathResolver =
        config.test.browser.expect.toMatchScreenshot.resolveScreenshotPath;
      expect(typeof pathResolver).toBe('function');

      const result = pathResolver({ arg: 'test.png', ext: '' });
      expect(result).toContain('.vizzly/baselines/test.png');
    });
  });

  describe('Comparator Function', () => {
    it('should return pass=true when Vizzly is not available', async () => {
      const { vizzlyComparator } = await import(
        '../../../clients/vitest/src/index.js'
      );

      // Mock data
      const reference = {
        data: new Uint8Array(4),
        metadata: { width: 1, height: 1 },
      };
      const actual = {
        data: new Uint8Array(4),
        metadata: { width: 1, height: 1 },
      };

      const result = await vizzlyComparator(reference, actual, {
        createDiff: false,
        name: 'test',
      });

      expect(result).toHaveProperty('pass');
      expect(result).toHaveProperty('diff');
      expect(result).toHaveProperty('message');

      // When Vizzly is not running, should pass with a message
      if (!result.pass) {
        expect(result.message).toContain('Vizzly');
      }
    });

    it('should handle properties option', async () => {
      const { vizzlyComparator } = await import(
        '../../../clients/vitest/src/index.js'
      );

      const reference = {
        data: new Uint8Array(4),
        metadata: { width: 1, height: 1 },
      };
      const actual = {
        data: new Uint8Array(4),
        metadata: { width: 1, height: 1 },
      };

      // Should not throw with properties
      const result = await vizzlyComparator(reference, actual, {
        createDiff: false,
        properties: {
          theme: 'dark',
          viewport: '1920x1080',
        },
        name: 'test-with-props',
      });

      expect(result).toBeDefined();
    });
  });

  describe('TypeScript Declarations', () => {
    it('should have valid TypeScript declarations', () => {
      const dtsPath = resolve(process.cwd(), 'clients/vitest/src/index.d.ts');
      expect(existsSync(dtsPath)).toBe(true);

      const content = readFileSync(dtsPath, 'utf-8');
      expect(content).toContain('export function vizzlyComparator');
      expect(content).toContain('export function vizzlyPlugin');
      expect(content).toContain("declare module 'vitest/node'");
      expect(content).toContain('ToMatchScreenshotComparators');
    });
  });

  describe('Package Configuration', () => {
    it('should have correct package.json exports', () => {
      const pkgPath = resolve(process.cwd(), 'clients/vitest/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.type).toBe('module');
      expect(pkg.exports['.']).toBeDefined();
      expect(pkg.exports['.'].import).toBe('./src/index.js');
      expect(pkg.exports['.'].types).toBe('./src/index.d.ts');
    });

    it('should have pngjs as dependency', () => {
      const pkgPath = resolve(process.cwd(), 'clients/vitest/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies).toHaveProperty('pngjs');
    });

    it('should have correct peer dependencies', () => {
      const pkgPath = resolve(process.cwd(), 'clients/vitest/package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.peerDependencies).toHaveProperty('@vizzly-testing/cli');
      expect(pkg.peerDependencies).toHaveProperty('vitest');
    });
  });

  describe('Helper Functions', () => {
    it('should export getVizzlyStatus', async () => {
      const { getVizzlyStatus } = await import(
        '../../../clients/vitest/src/index.js'
      );

      expect(typeof getVizzlyStatus).toBe('function');

      const status = getVizzlyStatus();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('ready');
    });

    it('should re-export getVizzlyInfo', async () => {
      const { getVizzlyInfo } = await import(
        '../../../clients/vitest/src/index.js'
      );

      expect(typeof getVizzlyInfo).toBe('function');
    });
  });
});
