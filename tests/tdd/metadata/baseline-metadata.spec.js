/**
 * Tests for baseline metadata I/O
 *
 * Uses real temp directories - no fs mocking needed.
 */

import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadBaselineMetadata,
  saveBaselineMetadata,
  createEmptyBaselineMetadata,
  upsertScreenshotInMetadata,
  findScreenshotBySignature,
} from '../../../src/tdd/metadata/baseline-metadata.js';

describe('baseline-metadata', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vizzly-test-baseline-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadBaselineMetadata', () => {
    it('returns null when metadata file does not exist', () => {
      let result = loadBaselineMetadata(tempDir);

      expect(result).toBeNull();
    });

    it('loads valid metadata from disk', () => {
      let metadata = {
        buildId: 'test-build',
        screenshots: [{ name: 'test', signature: 'test|1920|chrome' }],
      };
      saveBaselineMetadata(tempDir, metadata);

      let result = loadBaselineMetadata(tempDir);

      expect(result).toEqual(metadata);
    });

    it('returns null for invalid JSON', () => {
      let metadataPath = join(tempDir, 'metadata.json');
      writeFileSync(metadataPath, 'not valid json');

      let result = loadBaselineMetadata(tempDir);

      expect(result).toBeNull();
    });
  });

  describe('saveBaselineMetadata', () => {
    it('saves metadata to disk', () => {
      let metadata = { buildId: 'test', screenshots: [] };

      saveBaselineMetadata(tempDir, metadata);

      let metadataPath = join(tempDir, 'metadata.json');
      expect(existsSync(metadataPath)).toBe(true);

      let saved = JSON.parse(readFileSync(metadataPath, 'utf8'));
      expect(saved).toEqual(metadata);
    });

    it('creates directory if it does not exist', () => {
      let nestedPath = join(tempDir, 'nested', 'baselines');
      let metadata = { buildId: 'test', screenshots: [] };

      saveBaselineMetadata(nestedPath, metadata);

      expect(existsSync(join(nestedPath, 'metadata.json'))).toBe(true);
    });

    it('overwrites existing metadata', () => {
      let metadata1 = { buildId: 'first', screenshots: [] };
      let metadata2 = { buildId: 'second', screenshots: [] };

      saveBaselineMetadata(tempDir, metadata1);
      saveBaselineMetadata(tempDir, metadata2);

      let result = loadBaselineMetadata(tempDir);
      expect(result.buildId).toBe('second');
    });

    it('formats JSON with 2-space indentation', () => {
      let metadata = { buildId: 'test' };

      saveBaselineMetadata(tempDir, metadata);

      let content = readFileSync(join(tempDir, 'metadata.json'), 'utf8');
      expect(content).toContain('  "buildId"'); // 2-space indent
    });
  });

  describe('createEmptyBaselineMetadata', () => {
    it('creates metadata with default values', () => {
      let result = createEmptyBaselineMetadata();

      expect(result.buildId).toBe('local-baseline');
      expect(result.buildName).toBe('Local TDD Baseline');
      expect(result.environment).toBe('test');
      expect(result.branch).toBe('local');
      expect(result.threshold).toBe(2.0);
      expect(result.signatureProperties).toEqual([]);
      expect(result.screenshots).toEqual([]);
      expect(result.createdAt).toBeDefined();
    });

    it('uses provided threshold', () => {
      let result = createEmptyBaselineMetadata({ threshold: 5.0 });

      expect(result.threshold).toBe(5.0);
    });

    it('uses provided signature properties', () => {
      let result = createEmptyBaselineMetadata({
        signatureProperties: ['theme', 'device'],
      });

      expect(result.signatureProperties).toEqual(['theme', 'device']);
    });
  });

  describe('upsertScreenshotInMetadata', () => {
    it('adds new screenshot when not found', () => {
      let metadata = { screenshots: [] };
      let entry = { name: 'test', signature: 'test|1920|chrome' };

      let result = upsertScreenshotInMetadata(
        metadata,
        entry,
        'test|1920|chrome'
      );

      expect(result.screenshots).toHaveLength(1);
      expect(result.screenshots[0]).toEqual(entry);
    });

    it('updates existing screenshot by signature', () => {
      let metadata = {
        screenshots: [
          { name: 'test', signature: 'test|1920|chrome', path: '/old/path' },
        ],
      };
      let entry = {
        name: 'test',
        signature: 'test|1920|chrome',
        path: '/new/path',
      };

      let result = upsertScreenshotInMetadata(
        metadata,
        entry,
        'test|1920|chrome'
      );

      expect(result.screenshots).toHaveLength(1);
      expect(result.screenshots[0].path).toBe('/new/path');
    });

    it('creates screenshots array if missing', () => {
      let metadata = {};
      let entry = { name: 'test', signature: 'test|1920|chrome' };

      let result = upsertScreenshotInMetadata(
        metadata,
        entry,
        'test|1920|chrome'
      );

      expect(result.screenshots).toHaveLength(1);
    });

    it('mutates and returns the same object', () => {
      let metadata = { screenshots: [] };
      let entry = { name: 'test', signature: 'test|1920|chrome' };

      let result = upsertScreenshotInMetadata(
        metadata,
        entry,
        'test|1920|chrome'
      );

      expect(result).toBe(metadata);
    });
  });

  describe('findScreenshotBySignature', () => {
    it('finds screenshot by signature', () => {
      let metadata = {
        screenshots: [
          { name: 'one', signature: 'one|1920|chrome' },
          { name: 'two', signature: 'two|1920|chrome' },
        ],
      };

      let result = findScreenshotBySignature(metadata, 'two|1920|chrome');

      expect(result).toEqual({ name: 'two', signature: 'two|1920|chrome' });
    });

    it('returns null when not found', () => {
      let metadata = {
        screenshots: [{ name: 'test', signature: 'test|1920|chrome' }],
      };

      let result = findScreenshotBySignature(metadata, 'other|1920|chrome');

      expect(result).toBeNull();
    });

    it('returns null when metadata is null', () => {
      let result = findScreenshotBySignature(null, 'test|1920|chrome');

      expect(result).toBeNull();
    });

    it('returns null when screenshots array is missing', () => {
      let result = findScreenshotBySignature({}, 'test|1920|chrome');

      expect(result).toBeNull();
    });
  });
});
