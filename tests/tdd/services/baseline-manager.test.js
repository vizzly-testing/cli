import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  baselineExists,
  clearBaselineData,
  getBaselinePath,
  getCurrentPath,
  getDiffPath,
  initializeDirectories,
  promoteCurrentToBaseline,
  readBaseline,
  readCurrent,
  saveBaseline,
  saveCurrent,
} from '../../../src/tdd/services/baseline-manager.js';

describe('tdd/services/baseline-manager', () => {
  let testDir = join(process.cwd(), '.test-baseline-manager');

  beforeEach(() => {
    // Clean up before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initializeDirectories', () => {
    it('creates baseline, current, and diff directories', () => {
      let paths = initializeDirectories(testDir);

      assert.strictEqual(paths.baselinePath, join(testDir, '.vizzly', 'baselines'));
      assert.strictEqual(paths.currentPath, join(testDir, '.vizzly', 'current'));
      assert.strictEqual(paths.diffPath, join(testDir, '.vizzly', 'diffs'));

      assert.ok(existsSync(paths.baselinePath));
      assert.ok(existsSync(paths.currentPath));
      assert.ok(existsSync(paths.diffPath));
    });

    it('does not fail if directories already exist', () => {
      // Create first time
      initializeDirectories(testDir);
      // Create again - should not throw
      let paths = initializeDirectories(testDir);

      assert.ok(existsSync(paths.baselinePath));
    });
  });

  describe('clearBaselineData', () => {
    it('removes and recreates directories', () => {
      let paths = initializeDirectories(testDir);

      // Add some files
      writeFileSync(join(paths.baselinePath, 'test.png'), 'baseline');
      writeFileSync(join(paths.currentPath, 'test.png'), 'current');
      writeFileSync(join(paths.diffPath, 'test.png'), 'diff');

      clearBaselineData(paths);

      // Directories should exist but be empty
      assert.ok(existsSync(paths.baselinePath));
      assert.ok(existsSync(paths.currentPath));
      assert.ok(existsSync(paths.diffPath));

      // Files should be gone
      assert.ok(!existsSync(join(paths.baselinePath, 'test.png')));
      assert.ok(!existsSync(join(paths.currentPath, 'test.png')));
      assert.ok(!existsSync(join(paths.diffPath, 'test.png')));
    });
  });

  describe('saveBaseline', () => {
    it('saves image buffer to baseline directory', () => {
      let paths = initializeDirectories(testDir);
      let imageBuffer = Buffer.from('fake-png-data');

      saveBaseline(paths.baselinePath, 'homepage.png', imageBuffer);

      let savedPath = join(paths.baselinePath, 'homepage.png');
      assert.ok(existsSync(savedPath));
    });
  });

  describe('saveCurrent', () => {
    it('saves image buffer and returns path', () => {
      let paths = initializeDirectories(testDir);
      let imageBuffer = Buffer.from('current-png-data');

      let savedPath = saveCurrent(paths.currentPath, 'login.png', imageBuffer);

      assert.strictEqual(savedPath, join(paths.currentPath, 'login.png'));
      assert.ok(existsSync(savedPath));
    });
  });

  describe('baselineExists', () => {
    it('returns true when baseline exists', () => {
      let paths = initializeDirectories(testDir);
      writeFileSync(join(paths.baselinePath, 'exists.png'), 'data');

      assert.strictEqual(baselineExists(paths.baselinePath, 'exists.png'), true);
    });

    it('returns false when baseline does not exist', () => {
      let paths = initializeDirectories(testDir);

      assert.strictEqual(
        baselineExists(paths.baselinePath, 'notexists.png'),
        false
      );
    });
  });

  describe('path helpers', () => {
    it('getBaselinePath joins correctly', () => {
      assert.strictEqual(
        getBaselinePath('/baselines', 'test.png'),
        join('/baselines', 'test.png')
      );
    });

    it('getCurrentPath joins correctly', () => {
      assert.strictEqual(
        getCurrentPath('/current', 'test.png'),
        join('/current', 'test.png')
      );
    });

    it('getDiffPath joins correctly', () => {
      assert.strictEqual(
        getDiffPath('/diffs', 'test.png'),
        join('/diffs', 'test.png')
      );
    });
  });

  describe('promoteCurrentToBaseline', () => {
    it('copies current to baseline', () => {
      let paths = initializeDirectories(testDir);
      let imageData = Buffer.from('promoted-image');
      writeFileSync(join(paths.currentPath, 'promote.png'), imageData);

      promoteCurrentToBaseline(
        paths.currentPath,
        paths.baselinePath,
        'promote.png'
      );

      assert.ok(existsSync(join(paths.baselinePath, 'promote.png')));
      // Original should still exist
      assert.ok(existsSync(join(paths.currentPath, 'promote.png')));
    });

    it('throws if current file does not exist', () => {
      let paths = initializeDirectories(testDir);

      assert.throws(
        () =>
          promoteCurrentToBaseline(
            paths.currentPath,
            paths.baselinePath,
            'notfound.png'
          ),
        /Current screenshot not found/
      );
    });
  });

  describe('readBaseline', () => {
    it('reads baseline file contents', () => {
      let paths = initializeDirectories(testDir);
      let imageData = Buffer.from('baseline-content');
      writeFileSync(join(paths.baselinePath, 'read.png'), imageData);

      let content = readBaseline(paths.baselinePath, 'read.png');

      assert.deepStrictEqual(content, imageData);
    });
  });

  describe('readCurrent', () => {
    it('reads current file contents', () => {
      let paths = initializeDirectories(testDir);
      let imageData = Buffer.from('current-content');
      writeFileSync(join(paths.currentPath, 'read.png'), imageData);

      let content = readCurrent(paths.currentPath, 'read.png');

      assert.deepStrictEqual(content, imageData);
    });
  });
});
