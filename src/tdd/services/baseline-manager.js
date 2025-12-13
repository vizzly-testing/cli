/**
 * Baseline Manager
 *
 * Local baseline CRUD operations - manages the file system aspects
 * of baseline storage without any network operations.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Initialize TDD directory structure
 *
 * @param {string} workingDir - Working directory
 * @returns {{ baselinePath: string, currentPath: string, diffPath: string }}
 */
export function initializeDirectories(workingDir) {
  let vizzlyDir = join(workingDir, '.vizzly');
  let baselinePath = join(vizzlyDir, 'baselines');
  let currentPath = join(vizzlyDir, 'current');
  let diffPath = join(vizzlyDir, 'diffs');

  for (let dir of [baselinePath, currentPath, diffPath]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  return { baselinePath, currentPath, diffPath };
}

/**
 * Clear all baseline data for fresh download
 *
 * @param {{ baselinePath: string, currentPath: string, diffPath: string }} paths
 */
export function clearBaselineData(paths) {
  let { baselinePath, currentPath, diffPath } = paths;

  for (let dir of [baselinePath, currentPath, diffPath]) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Save an image as baseline
 *
 * @param {string} baselinePath - Path to baselines directory
 * @param {string} filename - Filename for the baseline
 * @param {Buffer} imageBuffer - Image data
 */
export function saveBaseline(baselinePath, filename, imageBuffer) {
  let filePath = join(baselinePath, filename);
  writeFileSync(filePath, imageBuffer);
}

/**
 * Save current screenshot
 *
 * @param {string} currentPath - Path to current screenshots directory
 * @param {string} filename - Filename for the screenshot
 * @param {Buffer} imageBuffer - Image data
 * @returns {string} Full path to saved file
 */
export function saveCurrent(currentPath, filename, imageBuffer) {
  let filePath = join(currentPath, filename);
  writeFileSync(filePath, imageBuffer);
  return filePath;
}

/**
 * Check if baseline exists for a filename
 *
 * @param {string} baselinePath - Path to baselines directory
 * @param {string} filename - Filename to check
 * @returns {boolean}
 */
export function baselineExists(baselinePath, filename) {
  return existsSync(join(baselinePath, filename));
}

/**
 * Get full path to a baseline file
 *
 * @param {string} baselinePath - Path to baselines directory
 * @param {string} filename - Filename
 * @returns {string}
 */
export function getBaselinePath(baselinePath, filename) {
  return join(baselinePath, filename);
}

/**
 * Get full path to a current file
 *
 * @param {string} currentPath - Path to current screenshots directory
 * @param {string} filename - Filename
 * @returns {string}
 */
export function getCurrentPath(currentPath, filename) {
  return join(currentPath, filename);
}

/**
 * Get full path to a diff file
 *
 * @param {string} diffPath - Path to diffs directory
 * @param {string} filename - Filename
 * @returns {string}
 */
export function getDiffPath(diffPath, filename) {
  return join(diffPath, filename);
}

/**
 * Promote current screenshot to baseline (accept as new baseline)
 *
 * @param {string} currentPath - Path to current screenshots directory
 * @param {string} baselinePath - Path to baselines directory
 * @param {string} filename - Filename
 */
export function promoteCurrentToBaseline(currentPath, baselinePath, filename) {
  let currentFile = join(currentPath, filename);
  let baselineFile = join(baselinePath, filename);

  if (!existsSync(currentFile)) {
    throw new Error(`Current screenshot not found: ${currentFile}`);
  }

  copyFileSync(currentFile, baselineFile);
}

/**
 * Read baseline image
 *
 * @param {string} baselinePath - Path to baselines directory
 * @param {string} filename - Filename
 * @returns {Buffer}
 */
export function readBaseline(baselinePath, filename) {
  return readFileSync(join(baselinePath, filename));
}

/**
 * Read current screenshot
 *
 * @param {string} currentPath - Path to current screenshots directory
 * @param {string} filename - Filename
 * @returns {Buffer}
 */
export function readCurrent(currentPath, filename) {
  return readFileSync(join(currentPath, filename));
}
