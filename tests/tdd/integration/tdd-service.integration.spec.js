/**
 * Integration tests for TddService
 *
 * Uses real filesystem, real honeydiff binary - no mocking.
 * Tests the full flow as users would experience it.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTDDService } from '../../../src/tdd/tdd-service.js';

// Use real test images from fixtures
let testImagePath = join(
  import.meta.dirname,
  '../../reporter/fixtures/images/baselines/homepage-desktop.png'
);

/**
 * Helper to create TddService with proper config structure
 */
function createService(tempDir, overrides = {}) {
  let config = {
    comparison: {
      threshold: overrides.threshold ?? 0.1,
      minClusterSize: overrides.minClusterSize ?? 2,
    },
    signatureProperties: overrides.signatureProperties ?? [],
    ...overrides.config,
  };
  return createTDDService(config, { workingDir: tempDir });
}

describe('TddService Integration', () => {
  let tempDir;
  let testImage;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vizzly-tdd-integration-'));
    testImage = readFileSync(testImagePath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('compareScreenshot', () => {
    it('creates baseline on first screenshot', async () => {
      let service = createService(tempDir);

      let result = await service.compareScreenshot('login-page', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
      });

      expect(result.status).toBe('new');
      expect(result.signature).toBe('login-page|1920|chrome');
      // New baselines don't have baselinePath in the result until saved
      expect(result.name).toBe('login-page');
    });

    it('passes when screenshot matches baseline', async () => {
      let service = createService(tempDir);

      // First call creates baseline
      await service.compareScreenshot('dashboard', testImage, {
        viewport_width: 1280,
        browser: 'firefox',
      });

      // Second call compares - identical image should pass
      let result = await service.compareScreenshot('dashboard', testImage, {
        viewport_width: 1280,
        browser: 'firefox',
      });

      expect(result.status).toBe('passed');
      expect(result.signature).toBe('dashboard|1280|firefox');
    });

    it('uses signature to differentiate screenshots with same name but different properties', async () => {
      let service = createService(tempDir);

      // Same name, different viewport = different signature
      let desktop = await service.compareScreenshot('homepage', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
      });

      let mobile = await service.compareScreenshot('homepage', testImage, {
        viewport_width: 375,
        browser: 'chrome',
      });

      expect(desktop.signature).toBe('homepage|1920|chrome');
      expect(mobile.signature).toBe('homepage|375|chrome');
      expect(desktop.signature).not.toBe(mobile.signature);
    });

    it('tracks all comparisons in results', async () => {
      let service = createService(tempDir);

      await service.compareScreenshot('page-1', testImage, {
        viewport_width: 1920,
      });
      await service.compareScreenshot('page-2', testImage, {
        viewport_width: 1920,
      });
      await service.compareScreenshot('page-3', testImage, {
        viewport_width: 1920,
      });

      let results = service.getResults();

      expect(results.comparisons).toHaveLength(3);
      expect(results.comparisons.map(c => c.name)).toEqual([
        'page-1',
        'page-2',
        'page-3',
      ]);
    });
  });

  describe('baseline management', () => {
    it('saves baseline images to disk', async () => {
      let service = createService(tempDir);

      await service.compareScreenshot('test', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
      });

      // Check that baseline directory has files
      let baselineDir = join(tempDir, '.vizzly', 'baselines');
      expect(existsSync(baselineDir)).toBe(true);

      // Find PNG files (baseline images)
      let files = require('node:fs').readdirSync(baselineDir);
      let pngFiles = files.filter(f => f.endsWith('.png'));
      expect(pngFiles.length).toBeGreaterThan(0);
    });

    it('persists baselines across service instances', async () => {
      // First instance creates baseline
      let service1 = createService(tempDir);
      await service1.compareScreenshot('persistent', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
      });

      // New instance should find existing baseline
      let service2 = createService(tempDir);
      let result = await service2.compareScreenshot('persistent', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
      });

      // Should pass (comparing against existing baseline), not create new
      expect(result.status).toBe('passed');
    });
  });

  describe('configuration', () => {
    it('respects custom threshold from config', async () => {
      let service = createService(tempDir, { threshold: 5.0 });

      expect(service.threshold).toBe(5.0);
    });

    it('respects custom signature properties', async () => {
      let service = createService(tempDir, {
        signatureProperties: ['theme'],
      });

      let result = await service.compareScreenshot('themed', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
        theme: 'dark',
      });

      // Custom properties are appended to default (viewport_width, browser)
      expect(result.signature).toBe('themed|1920|chrome|dark');
    });

    it('uses default signature properties when not specified', async () => {
      let service = createService(tempDir);

      let result = await service.compareScreenshot('default', testImage, {
        viewport_width: 1920,
        browser: 'chrome',
        someOtherProp: 'ignored',
      });

      // Default is viewport_width and browser only
      expect(result.signature).toBe('default|1920|chrome');
    });
  });
});
