/**
 * Tests for hotspot metadata I/O
 *
 * Uses real temp directories - no fs mocking needed.
 */

import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadHotspotMetadata,
  saveHotspotMetadata,
  getHotspotForScreenshot,
  createHotspotCache,
} from '../../../src/tdd/metadata/hotspot-metadata.js';

describe('hotspot-metadata', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vizzly-test-hotspot-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadHotspotMetadata', () => {
    it('returns null when hotspots file does not exist', () => {
      let result = loadHotspotMetadata(tempDir);

      expect(result).toBeNull();
    });

    it('loads hotspots from disk', () => {
      let vizzlyDir = join(tempDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      let hotspotData = {
        hotspots: {
          homepage: { regions: [{ y1: 10, y2: 20 }], confidence: 'high' },
        },
      };
      writeFileSync(
        join(vizzlyDir, 'hotspots.json'),
        JSON.stringify(hotspotData)
      );

      let result = loadHotspotMetadata(tempDir);

      expect(result).toEqual({
        homepage: { regions: [{ y1: 10, y2: 20 }], confidence: 'high' },
      });
    });

    it('returns null for invalid JSON', () => {
      let vizzlyDir = join(tempDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(join(vizzlyDir, 'hotspots.json'), 'not valid json');

      let result = loadHotspotMetadata(tempDir);

      expect(result).toBeNull();
    });

    it('returns null if hotspots key is missing', () => {
      let vizzlyDir = join(tempDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(
        join(vizzlyDir, 'hotspots.json'),
        JSON.stringify({ downloadedAt: '2024-01-01' })
      );

      let result = loadHotspotMetadata(tempDir);

      expect(result).toBeNull();
    });
  });

  describe('saveHotspotMetadata', () => {
    it('saves hotspot data to disk', () => {
      let hotspotData = {
        homepage: { regions: [{ y1: 10, y2: 20 }] },
      };

      saveHotspotMetadata(tempDir, hotspotData);

      let result = loadHotspotMetadata(tempDir);
      expect(result).toEqual(hotspotData);
    });

    it('creates .vizzly directory if missing', () => {
      let hotspotData = { test: { regions: [] } };

      saveHotspotMetadata(tempDir, hotspotData);

      expect(existsSync(join(tempDir, '.vizzly'))).toBe(true);
    });

    it('includes downloadedAt timestamp', () => {
      saveHotspotMetadata(tempDir, {});

      let content = JSON.parse(
        readFileSync(join(tempDir, '.vizzly', 'hotspots.json'), 'utf8')
      );

      expect(content.downloadedAt).toBeDefined();
      expect(new Date(content.downloadedAt).getTime()).toBeGreaterThan(0);
    });

    it('includes summary if provided', () => {
      let summary = { totalRegions: 5, screenshotCount: 2 };

      saveHotspotMetadata(tempDir, {}, summary);

      let content = JSON.parse(
        readFileSync(join(tempDir, '.vizzly', 'hotspots.json'), 'utf8')
      );

      expect(content.summary).toEqual(summary);
    });
  });

  describe('getHotspotForScreenshot', () => {
    it('returns hotspot from cache if available', () => {
      let cache = {
        data: {
          homepage: { regions: [{ y1: 10, y2: 20 }], confidence: 'high' },
        },
        loaded: true,
      };

      let result = getHotspotForScreenshot(cache, tempDir, 'homepage');

      expect(result).toEqual({
        regions: [{ y1: 10, y2: 20 }],
        confidence: 'high',
      });
    });

    it('loads from disk when cache is empty', () => {
      // Save hotspots to disk
      let hotspotData = {
        homepage: { regions: [{ y1: 5, y2: 15 }] },
      };
      saveHotspotMetadata(tempDir, hotspotData);

      let cache = createHotspotCache();

      let result = getHotspotForScreenshot(cache, tempDir, 'homepage');

      expect(result).toEqual({ regions: [{ y1: 5, y2: 15 }] });
      expect(cache.loaded).toBe(true);
      expect(cache.data).toEqual(hotspotData);
    });

    it('returns null when screenshot not found', () => {
      let cache = {
        data: { other: { regions: [] } },
        loaded: true,
      };

      let result = getHotspotForScreenshot(cache, tempDir, 'homepage');

      expect(result).toBeNull();
    });

    it('returns null when no hotspots exist on disk', () => {
      let cache = createHotspotCache();

      let result = getHotspotForScreenshot(cache, tempDir, 'homepage');

      expect(result).toBeNull();
      expect(cache.loaded).toBe(true);
    });

    it('only loads from disk once', () => {
      let cache = createHotspotCache();

      // First call - loads from disk (empty)
      getHotspotForScreenshot(cache, tempDir, 'homepage');
      expect(cache.loaded).toBe(true);

      // Now add hotspots to disk
      saveHotspotMetadata(tempDir, { homepage: { regions: [] } });

      // Second call - should NOT reload from disk
      let result = getHotspotForScreenshot(cache, tempDir, 'homepage');

      // Still null because cache.loaded is true and data was null
      expect(result).toBeNull();
    });
  });

  describe('createHotspotCache', () => {
    it('creates empty cache object', () => {
      let cache = createHotspotCache();

      expect(cache).toEqual({ data: null, loaded: false });
    });
  });
});
