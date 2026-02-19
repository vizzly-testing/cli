import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  createHotspotCache,
  getHotspotForScreenshot,
  loadHotspotMetadata,
  saveHotspotMetadata,
} from '../../../src/tdd/metadata/hotspot-metadata.js';
import { createStateStore } from '../../../src/tdd/state-store.js';

describe('tdd/metadata/hotspot-metadata', () => {
  let testDir = join(process.cwd(), '.test-hotspot-metadata');
  let vizzlyDir = join(testDir, '.vizzly');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadHotspotMetadata', () => {
    it('returns null when hotspot metadata does not exist', () => {
      let result = loadHotspotMetadata(testDir);

      assert.strictEqual(result, null);
    });

    it('loads hotspot metadata after saving', () => {
      let hotspotData = {
        homepage: { regions: [{ y1: 0, y2: 100 }], confidence: 'high' },
      };

      saveHotspotMetadata(testDir, hotspotData);

      let result = loadHotspotMetadata(testDir);
      assert.deepStrictEqual(result, hotspotData);
    });

    it('imports legacy hotspots.json into DB', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      let hotspotsData = {
        downloadedAt: '2025-01-01T00:00:00Z',
        summary: { totalScreenshots: 1 },
        hotspots: {
          homepage: { regions: [{ y1: 0, y2: 100 }], confidence: 'high' },
        },
      };

      writeFileSync(
        join(vizzlyDir, 'hotspots.json'),
        JSON.stringify(hotspotsData)
      );

      let result = loadHotspotMetadata(testDir);
      assert.deepStrictEqual(result, hotspotsData.hotspots);
    });
  });

  describe('saveHotspotMetadata', () => {
    it('stores hotspot metadata in state db', () => {
      let hotspotData = {
        homepage: { regions: [{ y1: 0, y2: 100 }] },
      };

      saveHotspotMetadata(testDir, hotspotData);

      assert.strictEqual(
        existsSync(join(testDir, '.vizzly', 'state.db')),
        true
      );
      assert.deepStrictEqual(loadHotspotMetadata(testDir), hotspotData);
    });

    it('stores summary with hotspot metadata', () => {
      let hotspotData = { homepage: {} };
      let summary = { totalScreenshots: 5, screenshotsWithHotspots: 3 };

      saveHotspotMetadata(testDir, hotspotData, summary);

      let store = createStateStore({ workingDir: testDir });
      try {
        let bundle = store.getHotspotBundle();
        assert.deepStrictEqual(bundle.summary, summary);
      } finally {
        store.close();
      }
    });
  });

  describe('createHotspotCache', () => {
    it('creates empty cache object', () => {
      let cache = createHotspotCache();

      assert.deepStrictEqual(cache, { data: null, loaded: false });
    });
  });

  describe('getHotspotForScreenshot', () => {
    it('returns null when cache is empty and no metadata exists', () => {
      let cache = createHotspotCache();

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.strictEqual(result, null);
      assert.strictEqual(cache.loaded, true);
    });

    it('returns cached data without loading from storage', () => {
      let cache = {
        data: { homepage: { regions: [], confidence: 'high' } },
        loaded: true,
      };

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.deepStrictEqual(result, { regions: [], confidence: 'high' });
    });

    it('loads from storage on first access and caches', () => {
      let hotspotData = {
        homepage: { regions: [{ y1: 10, y2: 50 }], confidence: 'medium' },
      };
      saveHotspotMetadata(testDir, hotspotData);
      let cache = createHotspotCache();

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.deepStrictEqual(result, hotspotData.homepage);
      assert.strictEqual(cache.loaded, true);
      assert.deepStrictEqual(cache.data, hotspotData);
    });

    it('returns null for screenshot not in hotspot data', () => {
      let cache = {
        data: { other: { regions: [] } },
        loaded: true,
      };

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.strictEqual(result, null);
    });

    it('returns from cache.data before checking loaded flag', () => {
      let cache = {
        data: { homepage: { regions: [], confidence: 'low' } },
        loaded: false,
      };

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.deepStrictEqual(result, { regions: [], confidence: 'low' });
      assert.strictEqual(cache.loaded, false);
    });
  });
});
