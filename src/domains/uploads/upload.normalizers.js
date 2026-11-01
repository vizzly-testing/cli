import { basename } from 'node:path';
import { computeSha256 } from './upload-files.js';

let KNOWN_BROWSERS = ['chrome', 'firefox', 'safari', 'edge', 'webkit'];

/**
 * Extract browser name from filename
 * @param {string} filename - The screenshot filename
 * @returns {string|null} Browser name or null if not found
 */
export function extractBrowserFromFilename(filename) {
  let lowerFilename = filename.toLowerCase();

  for (let browser of KNOWN_BROWSERS) {
    if (lowerFilename.includes(browser)) {
      return browser;
    }
  }

  return null;
}

/**
 * Build file metadata object
 * @param {string} filePath - Path to file
 * @param {Buffer} buffer - File contents
 * @returns {Object} File metadata
 */
export function buildFileMetadata(filePath, buffer) {
  return {
    path: filePath,
    filename: basename(filePath),
    buffer,
    sha256: computeSha256(buffer),
  };
}

/**
 * Convert file metadata to screenshot check format
 * @param {Object} file - File metadata
 * @returns {Object} Screenshot format for SHA check
 */
export function fileToScreenshotFormat(file) {
  let browser = extractBrowserFromFilename(file.filename);
  return {
    sha256: file.sha256,
    name: file.filename.replace(/\.png$/, ''),
    filename: file.filename,
    properties: browser ? { browser } : {},
  };
}

/**
 * Extract status code from error message
 * @param {string} errorMessage - Error message
 * @returns {string} Status code or 'unknown'
 */
export function extractStatusCodeFromError(errorMessage) {
  let match = String(errorMessage || '').match(/API request failed: (\d+)/);
  return match ? match[1] : 'unknown';
}
