import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  createRegionCache,
  getRegionsForScreenshot,
  loadRegionMetadata,
  saveRegionMetadata,
} from '../../../src/tdd/metadata/region-metadata.js';
import { createStateStore } from '../../../src/tdd/state-store.js';

describe('tdd/metadata/region-metadata', () => {
  let testDir = join(process.cwd(), '.test-region-metadata');
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

  describe('loadRegionMetadata', () => {
    it('returns null when region metadata does not exist', () => {
      let result = loadRegionMetadata(testDir);
      assert.strictEqual(result, null);
    });

    it('loads region metadata after saving', () => {
      let regionData = {
        homepage: {
          confirmed: [{ x: 1, y: 2, width: 50, height: 20 }],
          candidates: [],
        },
      };

      saveRegionMetadata(testDir, regionData);

      let result = loadRegionMetadata(testDir);
      assert.deepStrictEqual(result, regionData);
    });

    it('imports legacy regions.json into DB', () => {
      mkdirSync(vizzlyDir, { recursive: true });
      let legacy = {
        downloadedAt: '2025-01-01T00:00:00Z',
        summary: { total_regions: 2 },
        regions: {
          homepage: {
            confirmed: [{ x: 1, y: 2, width: 50, height: 20 }],
            candidates: [],
          },
        },
      };

      writeFileSync(join(vizzlyDir, 'regions.json'), JSON.stringify(legacy));

      let result = loadRegionMetadata(testDir);
      assert.deepStrictEqual(result, legacy.regions);
    });
  });

  describe('saveRegionMetadata', () => {
    it('stores region metadata in state db', () => {
      let regionData = {
        homepage: { confirmed: [{ x: 1, y: 2, width: 50, height: 20 }] },
      };

      saveRegionMetadata(testDir, regionData);

      assert.strictEqual(
        existsSync(join(testDir, '.vizzly', 'state.db')),
        true
      );
      assert.deepStrictEqual(loadRegionMetadata(testDir), regionData);
    });

    it('stores summary with region metadata', () => {
      let regionData = { homepage: { confirmed: [], candidates: [] } };
      let summary = { total_regions: 4 };

      saveRegionMetadata(testDir, regionData, summary);

      let store = createStateStore({ workingDir: testDir });
      try {
        let bundle = store.getRegionBundle();
        assert.deepStrictEqual(bundle.summary, summary);
      } finally {
        store.close();
      }
    });
  });

  describe('createRegionCache', () => {
    it('creates empty cache object', () => {
      assert.deepStrictEqual(createRegionCache(), {
        data: null,
        loaded: false,
      });
    });
  });

  describe('getRegionsForScreenshot', () => {
    it('returns null when cache is empty and no metadata exists', () => {
      let cache = createRegionCache();
      let result = getRegionsForScreenshot(cache, testDir, 'homepage');

      assert.strictEqual(result, null);
      assert.strictEqual(cache.loaded, true);
    });

    it('returns cached data without loading from storage', () => {
      let cache = {
        data: { homepage: { confirmed: [], candidates: [] } },
        loaded: true,
      };

      let result = getRegionsForScreenshot(cache, testDir, 'homepage');
      assert.deepStrictEqual(result, { confirmed: [], candidates: [] });
    });

    it('loads from storage on first access and caches', () => {
      let regionData = {
        homepage: {
          confirmed: [{ x: 1, y: 2, width: 50, height: 20 }],
          candidates: [],
        },
      };
      saveRegionMetadata(testDir, regionData);

      let cache = createRegionCache();
      let result = getRegionsForScreenshot(cache, testDir, 'homepage');

      assert.deepStrictEqual(result, regionData.homepage);
      assert.strictEqual(cache.loaded, true);
      assert.deepStrictEqual(cache.data, regionData);
    });
  });
});
