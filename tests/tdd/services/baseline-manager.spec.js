/**
 * Tests for baseline manager
 *
 * Uses real temp directories - no fs mocking needed.
 */

import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  initializeDirectories,
  clearBaselineData,
  saveBaseline,
  saveCurrent,
  baselineExists,
  getBaselinePath,
  getCurrentPath,
  getDiffPath,
  promoteCurrentToBaseline,
  readBaseline,
  readCurrent,
} from '../../../src/tdd/services/baseline-manager.js';

describe('baseline-manager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vizzly-test-manager-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initializeDirectories', () => {
    it('creates all required directories', () => {
      let paths = initializeDirectories(tempDir);

      expect(existsSync(paths.baselinePath)).toBe(true);
      expect(existsSync(paths.currentPath)).toBe(true);
      expect(existsSync(paths.diffPath)).toBe(true);
    });

    it('returns correct paths under .vizzly', () => {
      let paths = initializeDirectories(tempDir);

      expect(paths.baselinePath).toBe(join(tempDir, '.vizzly', 'baselines'));
      expect(paths.currentPath).toBe(join(tempDir, '.vizzly', 'current'));
      expect(paths.diffPath).toBe(join(tempDir, '.vizzly', 'diffs'));
    });

    it('is idempotent (can be called multiple times)', () => {
      initializeDirectories(tempDir);
      let paths = initializeDirectories(tempDir);

      expect(existsSync(paths.baselinePath)).toBe(true);
    });
  });

  describe('clearBaselineData', () => {
    it('clears all directories', () => {
      let paths = initializeDirectories(tempDir);

      // Add some files
      writeFileSync(join(paths.baselinePath, 'test.png'), 'baseline');
      writeFileSync(join(paths.currentPath, 'test.png'), 'current');
      writeFileSync(join(paths.diffPath, 'test.png'), 'diff');

      clearBaselineData(paths);

      // Directories should exist but be empty
      expect(existsSync(paths.baselinePath)).toBe(true);
      expect(existsSync(paths.currentPath)).toBe(true);
      expect(existsSync(paths.diffPath)).toBe(true);

      // Files should be gone
      expect(existsSync(join(paths.baselinePath, 'test.png'))).toBe(false);
      expect(existsSync(join(paths.currentPath, 'test.png'))).toBe(false);
      expect(existsSync(join(paths.diffPath, 'test.png'))).toBe(false);
    });
  });

  describe('saveBaseline', () => {
    it('saves image buffer to baselines directory', () => {
      let paths = initializeDirectories(tempDir);
      let imageBuffer = Buffer.from('fake image data');

      saveBaseline(paths.baselinePath, 'test.png', imageBuffer);

      expect(existsSync(join(paths.baselinePath, 'test.png'))).toBe(true);
      expect(readFileSync(join(paths.baselinePath, 'test.png'))).toEqual(
        imageBuffer
      );
    });
  });

  describe('saveCurrent', () => {
    it('saves image buffer to current directory and returns path', () => {
      let paths = initializeDirectories(tempDir);
      let imageBuffer = Buffer.from('current image data');

      let savedPath = saveCurrent(paths.currentPath, 'test.png', imageBuffer);

      expect(savedPath).toBe(join(paths.currentPath, 'test.png'));
      expect(existsSync(savedPath)).toBe(true);
      expect(readFileSync(savedPath)).toEqual(imageBuffer);
    });
  });

  describe('baselineExists', () => {
    it('returns true when baseline file exists', () => {
      let paths = initializeDirectories(tempDir);
      writeFileSync(join(paths.baselinePath, 'exists.png'), 'data');

      expect(baselineExists(paths.baselinePath, 'exists.png')).toBe(true);
    });

    it('returns false when baseline file does not exist', () => {
      let paths = initializeDirectories(tempDir);

      expect(baselineExists(paths.baselinePath, 'missing.png')).toBe(false);
    });
  });

  describe('path helpers', () => {
    it('getBaselinePath returns correct path', () => {
      let paths = initializeDirectories(tempDir);
      let result = getBaselinePath(paths.baselinePath, 'test.png');

      expect(result).toBe(join(paths.baselinePath, 'test.png'));
    });

    it('getCurrentPath returns correct path', () => {
      let paths = initializeDirectories(tempDir);
      let result = getCurrentPath(paths.currentPath, 'test.png');

      expect(result).toBe(join(paths.currentPath, 'test.png'));
    });

    it('getDiffPath returns correct path', () => {
      let paths = initializeDirectories(tempDir);
      let result = getDiffPath(paths.diffPath, 'test.png');

      expect(result).toBe(join(paths.diffPath, 'test.png'));
    });
  });

  describe('promoteCurrentToBaseline', () => {
    it('copies current to baseline', () => {
      let paths = initializeDirectories(tempDir);
      let imageData = Buffer.from('current image');
      writeFileSync(join(paths.currentPath, 'test.png'), imageData);

      promoteCurrentToBaseline(
        paths.currentPath,
        paths.baselinePath,
        'test.png'
      );

      expect(existsSync(join(paths.baselinePath, 'test.png'))).toBe(true);
      expect(readFileSync(join(paths.baselinePath, 'test.png'))).toEqual(
        imageData
      );
    });

    it('throws when current file does not exist', () => {
      let paths = initializeDirectories(tempDir);

      expect(() =>
        promoteCurrentToBaseline(
          paths.currentPath,
          paths.baselinePath,
          'missing.png'
        )
      ).toThrow('Current screenshot not found');
    });

    it('overwrites existing baseline', () => {
      let paths = initializeDirectories(tempDir);
      writeFileSync(join(paths.baselinePath, 'test.png'), 'old baseline');
      writeFileSync(join(paths.currentPath, 'test.png'), 'new current');

      promoteCurrentToBaseline(
        paths.currentPath,
        paths.baselinePath,
        'test.png'
      );

      expect(readFileSync(join(paths.baselinePath, 'test.png'), 'utf8')).toBe(
        'new current'
      );
    });
  });

  describe('readBaseline / readCurrent', () => {
    it('readBaseline returns file buffer', () => {
      let paths = initializeDirectories(tempDir);
      let data = Buffer.from('baseline data');
      writeFileSync(join(paths.baselinePath, 'test.png'), data);

      expect(readBaseline(paths.baselinePath, 'test.png')).toEqual(data);
    });

    it('readCurrent returns file buffer', () => {
      let paths = initializeDirectories(tempDir);
      let data = Buffer.from('current data');
      writeFileSync(join(paths.currentPath, 'test.png'), data);

      expect(readCurrent(paths.currentPath, 'test.png')).toEqual(data);
    });
  });
});
