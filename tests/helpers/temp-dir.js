/**
 * Shared temp directory infrastructure for tests
 *
 * Creates a SINGLE temp directory per test suite (file), not per test.
 * This dramatically reduces filesystem churn and prevents macOS Gatekeeper issues.
 *
 * Usage:
 *   import { useTempDir } from '../helpers/temp-dir.js';
 *
 *   describe('MyTest', () => {
 *     let tempDir = useTempDir();
 *
 *     it('uses temp directory', () => {
 *       let myPath = tempDir.path('subdir/file.txt');
 *       // myPath is now an absolute path inside the shared temp dir
 *     });
 *   });
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Global registry of temp directories to clean up on process exit
let tempDirs = new Set();

process.on('exit', () => {
  for (let dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

/**
 * Create a shared temp directory for a test suite
 *
 * The directory is created once in beforeAll and cleaned up in afterAll.
 * Each test gets an isolated subdirectory within the shared temp.
 *
 * @param {string} [prefix='vizzly-test'] - Prefix for the temp directory name
 * @returns {Object} TempDir helper object
 */
export function useTempDir(prefix = 'vizzly-test') {
  let baseDir = null;
  let testCounter = 0;
  let currentTestDir = null;

  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), `${prefix}-`));
    tempDirs.add(baseDir);
  });

  afterAll(() => {
    if (baseDir) {
      try {
        rmSync(baseDir, { recursive: true, force: true });
        tempDirs.delete(baseDir);
      } catch {
        // Ignore cleanup errors
      }
      baseDir = null;
    }
  });

  beforeEach(() => {
    // Each test gets its own subdirectory for isolation
    testCounter++;
    currentTestDir = join(baseDir, `test-${testCounter}`);
    mkdirSync(currentTestDir, { recursive: true });
  });

  return {
    /**
     * Get the base temp directory (shared across all tests in suite)
     */
    get base() {
      return baseDir;
    },

    /**
     * Get the current test's isolated directory
     */
    get current() {
      return currentTestDir;
    },

    /**
     * Create a path relative to the current test directory
     * @param {...string} segments - Path segments
     * @returns {string} Absolute path
     */
    path(...segments) {
      return join(currentTestDir, ...segments);
    },

    /**
     * Create a path relative to the base directory (shared)
     * @param {...string} segments - Path segments
     * @returns {string} Absolute path
     */
    sharedPath(...segments) {
      return join(baseDir, ...segments);
    },

    /**
     * Create a directory within current test dir
     * @param {...string} segments - Path segments
     * @returns {string} Created directory path
     */
    mkdir(...segments) {
      let dir = this.path(...segments);
      mkdirSync(dir, { recursive: true });
      return dir;
    },

    /**
     * Write a file within current test dir
     * @param {string} relativePath - Path relative to test dir
     * @param {string|Buffer} content - File content
     * @returns {string} Written file path
     */
    writeFile(relativePath, content) {
      let filePath = this.path(relativePath);
      let dir = join(filePath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content);
      return filePath;
    },

    /**
     * Read a file from current test dir
     * @param {string} relativePath - Path relative to test dir
     * @returns {Buffer} File content
     */
    readFile(relativePath) {
      return readFileSync(this.path(relativePath));
    },

    /**
     * Check if file exists in current test dir
     * @param {string} relativePath - Path relative to test dir
     * @returns {boolean}
     */
    exists(relativePath) {
      return existsSync(this.path(relativePath));
    },
  };
}

/**
 * Create a temp directory for a single test (use sparingly)
 *
 * This is for cases where you truly need isolation per test.
 * Prefer useTempDir() for most cases.
 *
 * @param {string} [prefix='vizzly-single'] - Prefix for temp dir
 * @returns {string} Temp directory path
 */
export function createTempDir(prefix = 'vizzly-single') {
  let dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tempDirs.add(dir);
  return dir;
}

/**
 * Clean up a specific temp directory
 * @param {string} dir - Directory to clean up
 */
export function cleanupTempDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
    tempDirs.delete(dir);
  } catch {
    // Ignore cleanup errors
  }
}
