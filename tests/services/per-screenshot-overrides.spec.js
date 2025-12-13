/**
 * Test per-screenshot threshold and minClusterSize overrides
 *
 * Tests verify that screenshot-level comparison settings override global config values.
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { compare } from '@vizzly-testing/honeydiff';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TddService } from '../../src/services/tdd-service.js';

// Mock honeydiff to capture what threshold/minClusterSize it's called with
vi.mock('@vizzly-testing/honeydiff', () => ({
  compare: vi.fn(async () => ({
    isDifferent: false,
    diffPercentage: 0,
    totalPixels: 100,
    diffPixels: 0,
    aaPixelsIgnored: 0,
    aaPercentage: 0,
  })),
}));

describe('Per-Screenshot Comparison Overrides', () => {
  let tddService;
  let testDir;

  beforeEach(() => {
    testDir = join(process.cwd(), '.tmp', `test-overrides-${Date.now()}`);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('should pass threshold and minClusterSize from config to honeydiff', async () => {
    tddService = new TddService(
      {
        comparison: { threshold: 3.5, minClusterSize: 4 },
      },
      testDir
    );

    // Fake image buffer
    let fakeImage = Buffer.from('fake-png-data');

    // First call creates baseline
    await tddService.compareScreenshot('test-config', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
    });

    // Second call compares
    await tddService.compareScreenshot('test-config', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
    });

    // Verify honeydiff was called with config values
    expect(compare).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        threshold: 3.5,
        minClusterSize: 4,
      })
    );
  });

  test('should pass per-screenshot threshold override to honeydiff', async () => {
    tddService = new TddService(
      {
        comparison: { threshold: 2.0, minClusterSize: 2 },
      },
      testDir
    );

    let fakeImage = Buffer.from('fake-png-data');

    // Create baseline
    await tddService.compareScreenshot('test-override', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
    });

    // Compare with override
    await tddService.compareScreenshot('test-override', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
      threshold: 10.0, // Override
      minClusterSize: 5, // Override
    });

    // Verify honeydiff was called with override values, NOT config values
    expect(compare).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        threshold: 10.0, // Should use override
        minClusterSize: 5, // Should use override
      })
    );
  });

  test('should include effective threshold/minClusterSize in comparison result', async () => {
    tddService = new TddService(
      {
        comparison: { threshold: 2.0, minClusterSize: 2 },
      },
      testDir
    );

    let fakeImage = Buffer.from('fake-png-data');

    // Create baseline
    await tddService.compareScreenshot('test-result', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
    });

    // Compare with override
    let result = await tddService.compareScreenshot('test-result', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
      threshold: 7.5,
      minClusterSize: 3,
    });

    // Comparison result should include the values used
    expect(result.threshold).toBe(7.5);
    expect(result.minClusterSize).toBe(3);
  });

  test('should reject invalid threshold/minClusterSize and fallback to config', async () => {
    tddService = new TddService(
      {
        comparison: { threshold: 2.0, minClusterSize: 2 },
      },
      testDir
    );

    let fakeImage = Buffer.from('fake-png-data');

    // Create baseline
    await tddService.compareScreenshot('test-invalid', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
    });

    // Compare with invalid values - should fallback to config
    let result = await tddService.compareScreenshot('test-invalid', fakeImage, {
      viewport_width: 1920,
      viewport_height: 1080,
      threshold: -5, // Invalid: negative
      minClusterSize: 0.5, // Invalid: not an integer
    });

    // Should use config values, not invalid overrides
    expect(compare).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        threshold: 2.0, // Config fallback
        minClusterSize: 2, // Config fallback
      })
    );
    expect(result.threshold).toBe(2.0);
    expect(result.minClusterSize).toBe(2);
  });
});
