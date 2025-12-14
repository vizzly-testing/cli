/**
 * Uploader Core - Pure functions for upload logic
 *
 * No I/O, no side effects - just data transformations.
 */

import crypto from 'node:crypto';
import { basename } from 'node:path';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_SHA_CHECK_BATCH_SIZE = 100;
export const DEFAULT_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate API key is present
 * @param {string|undefined} apiKey - API key to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateApiKey(apiKey) {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }
  return { valid: true, error: null };
}

/**
 * Validate screenshots directory path
 * @param {string|undefined} screenshotsDir - Directory path
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateScreenshotsDir(screenshotsDir) {
  if (!screenshotsDir) {
    return { valid: false, error: 'Screenshots directory is required' };
  }
  return { valid: true, error: null };
}

/**
 * Validate directory stats
 * @param {Object} stats - fs.stat result
 * @param {string} path - Directory path for error message
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDirectoryStats(stats, path) {
  if (!stats.isDirectory()) {
    return { valid: false, error: `${path} is not a directory` };
  }
  return { valid: true, error: null };
}

/**
 * Validate files were found
 * @param {Array} files - Array of file paths
 * @param {string} directory - Directory that was searched
 * @returns {{ valid: boolean, error: string|null, context?: Object }}
 */
export function validateFilesFound(files, directory) {
  if (!files || files.length === 0) {
    return {
      valid: false,
      error: 'No screenshot files found',
      context: { directory, pattern: '**/*.png' },
    };
  }
  return { valid: true, error: null };
}

// ============================================================================
// Browser Extraction
// ============================================================================

const KNOWN_BROWSERS = ['chrome', 'firefox', 'safari', 'edge', 'webkit'];

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

// ============================================================================
// Build Info Construction
// ============================================================================

/**
 * Build API build info payload
 * @param {Object} options - Upload options
 * @param {string} [defaultBranch] - Default branch to use
 * @returns {Object} Build info payload
 */
export function buildBuildInfo(options, defaultBranch = 'main') {
  return {
    name: options.buildName || `Upload ${new Date().toISOString()}`,
    branch: options.branch || defaultBranch || 'main',
    commit_sha: options.commit,
    commit_message: options.message,
    environment: options.environment || 'production',
    threshold: options.threshold,
    github_pull_request_number: options.pullRequestNumber,
    parallel_id: options.parallelId,
  };
}

// ============================================================================
// File Metadata Processing
// ============================================================================

/**
 * Compute SHA256 hash of a buffer
 * @param {Buffer} buffer - File buffer
 * @returns {string} Hex-encoded SHA256 hash
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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
  return {
    sha256: file.sha256,
    name: file.filename.replace(/\.png$/, ''),
    browser: extractBrowserFromFilename(file.filename) || 'chrome',
    viewport_width: 1920,
    viewport_height: 1080,
  };
}

/**
 * Partition files into those that need upload and those that exist
 * @param {Array} fileMetadata - All file metadata
 * @param {Set} existingShas - Set of SHAs that already exist
 * @returns {{ toUpload: Array, existing: Array }}
 */
export function partitionFilesByExistence(fileMetadata, existingShas) {
  return {
    toUpload: fileMetadata.filter(f => !existingShas.has(f.sha256)),
    existing: fileMetadata.filter(f => existingShas.has(f.sha256)),
  };
}

// ============================================================================
// Progress Reporting
// ============================================================================

/**
 * Build scanning phase progress
 * @param {number} total - Total files found
 * @returns {Object} Progress object
 */
export function buildScanningProgress(total) {
  return {
    phase: 'scanning',
    message: `Found ${total} screenshots`,
    total,
  };
}

/**
 * Build processing phase progress
 * @param {number} current - Current file number
 * @param {number} total - Total files
 * @returns {Object} Progress object
 */
export function buildProcessingProgress(current, total) {
  return {
    phase: 'processing',
    message: 'Processing files',
    current,
    total,
  };
}

/**
 * Build deduplication phase progress
 * @param {number} toUpload - Files to upload
 * @param {number} existing - Existing files
 * @param {number} total - Total files
 * @returns {Object} Progress object
 */
export function buildDeduplicationProgress(toUpload, existing, total) {
  return {
    phase: 'deduplication',
    message: `Checking for duplicates (${toUpload} to upload, ${existing} existing)`,
    toUpload,
    existing,
    total,
  };
}

/**
 * Build uploading phase progress
 * @param {number} current - Current upload number
 * @param {number} total - Total to upload
 * @returns {Object} Progress object
 */
export function buildUploadingProgress(current, total) {
  return {
    phase: 'uploading',
    message: 'Uploading screenshots',
    current,
    total,
  };
}

/**
 * Build completed phase progress
 * @param {string} buildId - Build ID
 * @param {string|null} url - Build URL
 * @returns {Object} Progress object
 */
export function buildCompletedProgress(buildId, url) {
  return {
    phase: 'completed',
    message: 'Upload completed',
    buildId,
    url,
  };
}

// ============================================================================
// Result Building
// ============================================================================

/**
 * Build successful upload result
 * @param {Object} options - Options
 * @param {string} options.buildId - Build ID
 * @param {string|null} options.url - Build URL
 * @param {number} options.total - Total files
 * @param {number} options.uploaded - Files uploaded
 * @param {number} options.skipped - Files skipped
 * @returns {Object} Upload result
 */
export function buildUploadResult({ buildId, url, total, uploaded, skipped }) {
  return {
    success: true,
    buildId,
    url,
    stats: {
      total,
      uploaded,
      skipped,
    },
  };
}

/**
 * Build wait result from build response
 * @param {Object} build - Build object from API
 * @returns {Object} Wait result
 */
export function buildWaitResult(build) {
  let result = {
    status: 'completed',
    build,
  };

  if (typeof build.comparisonsTotal === 'number') {
    result.comparisons = build.comparisonsTotal;
    result.passedComparisons = build.comparisonsPassed || 0;
    result.failedComparisons = build.comparisonsFailed || 0;
  } else {
    result.passedComparisons = 0;
    result.failedComparisons = 0;
  }

  if (build.url) {
    result.url = build.url;
  }

  return result;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Resolve batch size from options and config
 * @param {Object} options - Runtime options
 * @param {Object} uploadConfig - Upload configuration
 * @returns {number} Resolved batch size
 */
export function resolveBatchSize(options, uploadConfig) {
  return Number(
    options?.batchSize ?? uploadConfig?.batchSize ?? DEFAULT_BATCH_SIZE
  );
}

/**
 * Resolve timeout from options and config
 * @param {Object} options - Runtime options
 * @param {Object} uploadConfig - Upload configuration
 * @returns {number} Resolved timeout in ms
 */
export function resolveTimeout(options, uploadConfig) {
  return Number(options?.timeout ?? uploadConfig?.timeout ?? DEFAULT_TIMEOUT);
}

/**
 * Check if timeout has been exceeded
 * @param {number} startTime - Start timestamp
 * @param {number} timeout - Timeout in ms
 * @returns {boolean} True if timed out
 */
export function isTimedOut(startTime, timeout) {
  return Date.now() - startTime >= timeout;
}

/**
 * Get elapsed time since start
 * @param {number} startTime - Start timestamp
 * @returns {number} Elapsed time in ms
 */
export function getElapsedTime(startTime) {
  return Date.now() - startTime;
}

/**
 * Build glob pattern for screenshots
 * @param {string} directory - Base directory
 * @returns {string} Glob pattern
 */
export function buildScreenshotPattern(directory) {
  return `${directory}/**/*.png`;
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
