/**
 * Baseline Downloader
 *
 * Functions for downloading baseline images from the cloud API.
 * These are lower-level utilities - orchestration happens in TddService.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { fetchWithTimeout } from '../../utils/fetch-utils.js';

/**
 * Download a single baseline image
 *
 * @param {string} url - URL to download from
 * @param {string} destPath - Destination file path
 * @param {Object} options - Options
 * @param {number} options.timeout - Request timeout in ms (default: 30000)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function downloadBaselineImage(url, destPath, options = {}) {
  let { timeout = 30000 } = options;

  try {
    let response = await fetchWithTimeout(url, { timeout });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    let buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(destPath, buffer);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if a baseline already exists with matching SHA
 *
 * @param {string} filePath - Path to the baseline file
 * @param {string} expectedSha - Expected SHA256 hash
 * @param {Map<string, string>} shaMap - Map of filename -> sha256
 * @returns {boolean}
 */
export function baselineMatchesSha(filePath, expectedSha, shaMap) {
  if (!existsSync(filePath) || !expectedSha) {
    return false;
  }

  let filename = filePath.split('/').pop();
  let storedSha = shaMap.get(filename);

  return storedSha === expectedSha;
}

/**
 * Download multiple baselines in batches
 *
 * @param {Array} screenshots - Screenshots to download
 * @param {Object} options - Options
 * @param {string} options.baselinePath - Path to baselines directory
 * @param {Map<string, string>} options.existingShaMap - Existing SHA map for skip logic
 * @param {number} options.batchSize - Concurrent downloads (default: 5)
 * @param {Function} options.onProgress - Progress callback (downloaded, skipped, errors, total)
 * @param {Function} options.getFilePath - Function to get file path for a screenshot
 * @returns {Promise<{ downloaded: number, skipped: number, errors: number }>}
 */
export async function downloadBaselinesInBatches(screenshots, options = {}) {
  let {
    existingShaMap = new Map(),
    batchSize = 5,
    onProgress,
    getFilePath,
  } = options;

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  let total = screenshots.length;

  // Process in batches
  for (let i = 0; i < screenshots.length; i += batchSize) {
    let batch = screenshots.slice(i, i + batchSize);

    let batchPromises = batch.map(async screenshot => {
      let filePath = getFilePath(screenshot);
      let url = screenshot.original_url;

      if (!url) {
        errors++;
        return;
      }

      // Skip if SHA matches
      if (baselineMatchesSha(filePath, screenshot.sha256, existingShaMap)) {
        skipped++;
        downloaded++;
        return;
      }

      let result = await downloadBaselineImage(url, filePath);

      if (result.success) {
        downloaded++;
      } else {
        errors++;
      }
    });

    await Promise.all(batchPromises);

    if (onProgress) {
      onProgress(downloaded, skipped, errors, total);
    }
  }

  return { downloaded, skipped, errors };
}

/**
 * Build baseline metadata entry for a downloaded screenshot
 *
 * @param {Object} screenshot - Screenshot data from API
 * @param {string} filename - Local filename
 * @param {string} filePath - Full file path
 * @param {Object} buildInfo - Build information
 * @returns {Object} Metadata entry
 */
export function buildBaselineMetadataEntry(
  screenshot,
  filename,
  filePath,
  buildInfo = {}
) {
  return {
    name: screenshot.name,
    originalName: screenshot.name,
    sha256: screenshot.sha256,
    id: screenshot.id,
    filename,
    path: filePath,
    browser: screenshot.browser || screenshot.metadata?.browser,
    viewport_width:
      screenshot.viewport_width ||
      screenshot.metadata?.viewport?.width ||
      screenshot.properties?.viewport?.width,
    originalUrl: screenshot.original_url,
    fileSize: screenshot.file_size,
    dimensions: screenshot.dimensions,
    // Build info for tracking
    buildId: buildInfo.buildId,
    commitSha: buildInfo.commitSha,
    approvalStatus: screenshot.approval_status,
  };
}
