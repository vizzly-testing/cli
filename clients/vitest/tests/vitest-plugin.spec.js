/**
 * Integration tests for Vitest plugin
 *
 * These tests verify the @vizzly-testing/vitest package works correctly
 * with Vitest's browser mode and screenshot comparator API.
 *
 * These run in Node environment to test the Vite plugin configuration.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('Vitest Plugin Integration', () => {
  describe('Plugin Configuration', () => {
    it('should register setup file', async () => {
      const { vizzlyPlugin } = await import('../src/index.js');

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config, { mode: 'test' });

      expect(config.test.setupFiles).toBeDefined();
      expect(Array.isArray(config.test.setupFiles)).toBe(true);
      expect(config.test.setupFiles.some((file) => file.includes('setup.js'))).toBe(true);
    });

    it('should pass environment variables to browser context', async () => {
      const { vizzlyPlugin } = await import('../src/index.js');

      let config = { test: {} };
      let plugin = vizzlyPlugin();
      config = plugin.config(config, { mode: 'test' });

      expect(config.define).toBeDefined();
      expect(config.define['import.meta.env.VIZZLY_SERVER_URL']).toBeDefined();
      expect(config.define['import.meta.env.VIZZLY_BUILD_ID']).toBeDefined();
    });
  });

  describe('Custom Matcher', () => {
    it('should export toMatchScreenshot function', async () => {
      const { toMatchScreenshot } = await import('../src/index.js');

      expect(typeof toMatchScreenshot).toBe('function');
    });
  });

  describe('TypeScript Declarations', () => {
    it('should have valid TypeScript declarations', () => {
      const dtsPath = resolve(process.cwd(), 'src/index.d.ts');
      expect(existsSync(dtsPath)).toBe(true);

      const content = readFileSync(dtsPath, 'utf-8');
      // Check for core exports
      expect(content).toContain('export function vizzlyPlugin');
      expect(content).toContain('export function getVizzlyStatus');
      // Note: toMatchScreenshot is defined in setup.js, not in index.d.ts
    });
  });

  describe('Package Configuration', () => {
    it('should have correct package.json exports', () => {
      const pkgPath = resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.type).toBe('module');
      expect(pkg.exports['.']).toBeDefined();
      expect(pkg.exports['.'].import).toBe('./src/index.js');
      expect(pkg.exports['.'].types).toBe('./src/index.d.ts');
    });

    it('should have pngjs as dependency', () => {
      const pkgPath = resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.dependencies).toHaveProperty('pngjs');
    });

    it('should have correct peer dependencies', () => {
      const pkgPath = resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.peerDependencies).toHaveProperty('@vizzly-testing/cli');
      expect(pkg.peerDependencies).toHaveProperty('vitest');
    });
  });

  describe('Helper Functions', () => {
    it('should export getVizzlyStatus', async () => {
      const { getVizzlyStatus } = await import(
        '../src/index.js'
      );

      expect(typeof getVizzlyStatus).toBe('function');

      const status = getVizzlyStatus();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('ready');
    });

    it('should re-export getVizzlyInfo', async () => {
      const { getVizzlyInfo } = await import(
        '../src/index.js'
      );

      expect(typeof getVizzlyInfo).toBe('function');
    });
  });
});
