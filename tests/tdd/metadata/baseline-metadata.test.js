import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  createEmptyBaselineMetadata,
  findScreenshotBySignature,
  loadBaselineBuildMetadata,
  loadBaselineMetadata,
  saveBaselineBuildMetadata,
  saveBaselineMetadata,
  upsertScreenshotInMetadata,
} from '../../../src/tdd/metadata/baseline-metadata.js';

describe('tdd/metadata/baseline-metadata', () => {
  let testDir = join(process.cwd(), '.test-baseline-metadata');
  let baselinePath = join(testDir, '.vizzly', 'baselines');

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

  describe('loadBaselineMetadata', () => {
    it('returns null when metadata does not exist', () => {
      let result = loadBaselineMetadata(baselinePath);

      assert.strictEqual(result, null);
    });

    it('loads metadata after saving', () => {
      let metadata = { buildId: 'test-123', screenshots: [] };
      saveBaselineMetadata(baselinePath, metadata);

      let result = loadBaselineMetadata(baselinePath);

      assert.deepStrictEqual(result, metadata);
    });

    it('imports legacy baselines/metadata.json into DB', () => {
      mkdirSync(baselinePath, { recursive: true });
      let metadata = {
        buildId: 'legacy-build',
        screenshots: [{ name: 'home' }],
      };
      writeFileSync(
        join(baselinePath, 'metadata.json'),
        JSON.stringify(metadata)
      );

      let result = loadBaselineMetadata(baselinePath);

      assert.deepStrictEqual(result, metadata);
    });
  });

  describe('saveBaselineMetadata', () => {
    it('creates state db and saves metadata', () => {
      let metadata = { buildId: 'new-build', screenshots: [] };

      saveBaselineMetadata(baselinePath, metadata);

      assert.strictEqual(
        existsSync(join(testDir, '.vizzly', 'state.db')),
        true
      );
      assert.deepStrictEqual(loadBaselineMetadata(baselinePath), metadata);
    });

    it('overwrites existing metadata', () => {
      saveBaselineMetadata(baselinePath, { buildId: 'old-build' });
      let newMetadata = { buildId: 'updated-build', screenshots: [] };

      saveBaselineMetadata(baselinePath, newMetadata);

      assert.deepStrictEqual(loadBaselineMetadata(baselinePath), newMetadata);
    });
  });

  describe('baseline build metadata', () => {
    it('saves and loads baseline build metadata', () => {
      let metadata = {
        buildId: 'build-1',
        commitSha: 'abc123',
        downloadedAt: '2025-01-01T00:00:00Z',
      };

      saveBaselineBuildMetadata(testDir, metadata);

      let result = loadBaselineBuildMetadata(testDir);
      assert.deepStrictEqual(result, metadata);
    });

    it('returns null when baseline build metadata is missing', () => {
      let result = loadBaselineBuildMetadata(testDir);
      assert.strictEqual(result, null);
    });
  });

  describe('createEmptyBaselineMetadata', () => {
    it('creates metadata with default values', () => {
      let result = createEmptyBaselineMetadata();

      assert.strictEqual(result.buildId, 'local-baseline');
      assert.strictEqual(result.buildName, 'Local TDD Baseline');
      assert.strictEqual(result.environment, 'test');
      assert.strictEqual(result.branch, 'local');
      assert.strictEqual(result.threshold, 2.0);
      assert.deepStrictEqual(result.signatureProperties, []);
      assert.deepStrictEqual(result.screenshots, []);
      assert.ok(result.createdAt);
    });

    it('uses provided threshold option', () => {
      let result = createEmptyBaselineMetadata({ threshold: 5.0 });

      assert.strictEqual(result.threshold, 5.0);
    });

    it('uses provided signatureProperties option', () => {
      let result = createEmptyBaselineMetadata({
        signatureProperties: ['viewport', 'browser'],
      });

      assert.deepStrictEqual(result.signatureProperties, [
        'viewport',
        'browser',
      ]);
    });
  });

  describe('upsertScreenshotInMetadata', () => {
    it('adds new screenshot to empty array', () => {
      let metadata = { screenshots: [] };
      let entry = { signature: 'test|1920|chrome', name: 'test' };

      let result = upsertScreenshotInMetadata(
        metadata,
        entry,
        'test|1920|chrome'
      );

      assert.strictEqual(result, metadata);
      assert.strictEqual(result.screenshots.length, 1);
      assert.deepStrictEqual(result.screenshots[0], entry);
    });

    it('creates screenshots array if missing', () => {
      let metadata = {};
      let entry = { signature: 'test|1920|chrome', name: 'test' };

      let result = upsertScreenshotInMetadata(
        metadata,
        entry,
        'test|1920|chrome'
      );

      assert.strictEqual(result.screenshots.length, 1);
    });

    it('updates existing screenshot with matching signature', () => {
      let metadata = {
        screenshots: [{ signature: 'test|1920|chrome', sha: 'old-sha' }],
      };
      let entry = { signature: 'test|1920|chrome', sha: 'new-sha' };

      upsertScreenshotInMetadata(metadata, entry, 'test|1920|chrome');

      assert.strictEqual(metadata.screenshots.length, 1);
      assert.strictEqual(metadata.screenshots[0].sha, 'new-sha');
    });

    it('adds new entry when signature not found', () => {
      let metadata = {
        screenshots: [{ signature: 'existing|1920|chrome', name: 'existing' }],
      };
      let entry = { signature: 'new|1920|chrome', name: 'new' };

      upsertScreenshotInMetadata(metadata, entry, 'new|1920|chrome');

      assert.strictEqual(metadata.screenshots.length, 2);
    });
  });

  describe('findScreenshotBySignature', () => {
    it('returns null for null metadata', () => {
      let result = findScreenshotBySignature(null, 'test|1920|chrome');

      assert.strictEqual(result, null);
    });

    it('returns null for metadata without screenshots', () => {
      let result = findScreenshotBySignature({}, 'test|1920|chrome');

      assert.strictEqual(result, null);
    });

    it('returns null when signature not found', () => {
      let metadata = {
        screenshots: [{ signature: 'other|1920|chrome', name: 'other' }],
      };

      let result = findScreenshotBySignature(metadata, 'test|1920|chrome');

      assert.strictEqual(result, null);
    });

    it('returns matching screenshot entry', () => {
      let expected = {
        signature: 'test|1920|chrome',
        name: 'test',
        sha: 'abc123',
      };
      let metadata = {
        screenshots: [
          { signature: 'other|1920|chrome', name: 'other' },
          expected,
        ],
      };

      let result = findScreenshotBySignature(metadata, 'test|1920|chrome');

      assert.deepStrictEqual(result, expected);
    });
  });
});
