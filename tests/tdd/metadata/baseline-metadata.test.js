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
  createEmptyBaselineMetadata,
  findScreenshotBySignature,
  loadBaselineMetadata,
  saveBaselineMetadata,
  upsertScreenshotInMetadata,
} from '../../../src/tdd/metadata/baseline-metadata.js';

describe('tdd/metadata/baseline-metadata', () => {
  let testDir = join(process.cwd(), '.test-baseline-metadata');

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
    it('returns null when metadata file does not exist', () => {
      let result = loadBaselineMetadata(testDir);

      assert.strictEqual(result, null);
    });

    it('loads and parses existing metadata file', () => {
      mkdirSync(testDir, { recursive: true });
      let metadata = { buildId: 'test-123', screenshots: [] };
      writeFileSync(join(testDir, 'metadata.json'), JSON.stringify(metadata));

      let result = loadBaselineMetadata(testDir);

      assert.deepStrictEqual(result, metadata);
    });

    it('returns null for invalid JSON', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'metadata.json'), 'not valid json {{{');

      let result = loadBaselineMetadata(testDir);

      assert.strictEqual(result, null);
    });
  });

  describe('saveBaselineMetadata', () => {
    it('creates directory and saves metadata', () => {
      let metadata = { buildId: 'new-build', screenshots: [] };

      saveBaselineMetadata(testDir, metadata);

      assert.strictEqual(existsSync(testDir), true);
      let content = JSON.parse(
        readFileSync(join(testDir, 'metadata.json'), 'utf8')
      );
      assert.deepStrictEqual(content, metadata);
    });

    it('overwrites existing metadata file', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        join(testDir, 'metadata.json'),
        JSON.stringify({ old: true })
      );
      let newMetadata = { buildId: 'updated', screenshots: [] };

      saveBaselineMetadata(testDir, newMetadata);

      let content = JSON.parse(
        readFileSync(join(testDir, 'metadata.json'), 'utf8')
      );
      assert.deepStrictEqual(content, newMetadata);
    });

    it('writes formatted JSON with 2-space indent', () => {
      let metadata = { key: 'value' };

      saveBaselineMetadata(testDir, metadata);

      let raw = readFileSync(join(testDir, 'metadata.json'), 'utf8');
      assert.strictEqual(raw, JSON.stringify(metadata, null, 2));
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
