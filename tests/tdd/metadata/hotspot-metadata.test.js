import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  createHotspotCache,
  getHotspotForScreenshot,
  loadHotspotMetadata,
  saveHotspotMetadata,
} from '../../../src/tdd/metadata/hotspot-metadata.js';

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
    it('returns null when hotspots.json does not exist', () => {
      let result = loadHotspotMetadata(testDir);

      assert.strictEqual(result, null);
    });

    it('loads and returns hotspots from file', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      let hotspotsData = {
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

    it('returns null when hotspots field is missing', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(
        join(vizzlyDir, 'hotspots.json'),
        JSON.stringify({ other: 'data' })
      );

      let result = loadHotspotMetadata(testDir);

      assert.strictEqual(result, null);
    });

    it('returns null for invalid JSON', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(join(vizzlyDir, 'hotspots.json'), 'not valid json');

      let result = loadHotspotMetadata(testDir);

      assert.strictEqual(result, null);
    });
  });

  describe('saveHotspotMetadata', () => {
    it('creates .vizzly directory and saves hotspots', () => {
      let hotspotData = {
        homepage: { regions: [{ y1: 0, y2: 100 }] },
      };

      saveHotspotMetadata(testDir, hotspotData);

      assert.strictEqual(existsSync(vizzlyDir), true);
      let content = JSON.parse(
        readFileSync(join(vizzlyDir, 'hotspots.json'), 'utf8')
      );
      assert.deepStrictEqual(content.hotspots, hotspotData);
      assert.ok(content.downloadedAt);
    });

    it('includes summary in saved data', () => {
      let hotspotData = { homepage: {} };
      let summary = { totalScreenshots: 5, screenshotsWithHotspots: 3 };

      saveHotspotMetadata(testDir, hotspotData, summary);

      let content = JSON.parse(
        readFileSync(join(vizzlyDir, 'hotspots.json'), 'utf8')
      );
      assert.deepStrictEqual(content.summary, summary);
    });

    it('writes formatted JSON', () => {
      let hotspotData = { key: 'value' };

      saveHotspotMetadata(testDir, hotspotData);

      let raw = readFileSync(join(vizzlyDir, 'hotspots.json'), 'utf8');
      assert.ok(raw.includes('\n')); // Check it's formatted
    });

    it('works when .vizzly directory already exists', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      let hotspotData = { test: {} };

      saveHotspotMetadata(testDir, hotspotData);

      let content = JSON.parse(
        readFileSync(join(vizzlyDir, 'hotspots.json'), 'utf8')
      );
      assert.deepStrictEqual(content.hotspots, hotspotData);
    });
  });

  describe('createHotspotCache', () => {
    it('creates empty cache object', () => {
      let cache = createHotspotCache();

      assert.deepStrictEqual(cache, { data: null, loaded: false });
    });
  });

  describe('getHotspotForScreenshot', () => {
    it('returns null when cache is empty and no file exists', () => {
      let cache = createHotspotCache();

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.strictEqual(result, null);
      assert.strictEqual(cache.loaded, true); // Should mark as loaded
    });

    it('returns cached data without reading file again', () => {
      let cache = {
        data: { homepage: { regions: [], confidence: 'high' } },
        loaded: true,
      };

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.deepStrictEqual(result, { regions: [], confidence: 'high' });
    });

    it('loads from disk on first access and caches', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      let hotspotData = {
        homepage: { regions: [{ y1: 10, y2: 50 }], confidence: 'medium' },
      };
      writeFileSync(
        join(vizzlyDir, 'hotspots.json'),
        JSON.stringify({ hotspots: hotspotData })
      );
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
      // Even if loaded is false, if data exists for this screenshot, return it
      let cache = {
        data: { homepage: { regions: [], confidence: 'low' } },
        loaded: false,
      };

      let result = getHotspotForScreenshot(cache, testDir, 'homepage');

      assert.deepStrictEqual(result, { regions: [], confidence: 'low' });
      // loaded should still be false since we got a cache hit
      assert.strictEqual(cache.loaded, false);
    });
  });
});
