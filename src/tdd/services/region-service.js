/**
 * Region Service
 *
 * Functions for downloading and managing user-defined hotspot regions from the cloud.
 * Regions are 2D bounding boxes that users have confirmed as dynamic content areas.
 */

import { saveRegionMetadata } from '../metadata/region-metadata.js';

/**
 * Download user-defined regions from cloud API
 *
 * @param {Object} options
 * @param {Object} options.api - ApiService instance
 * @param {string} options.workingDir - Working directory
 * @param {string[]} options.screenshotNames - Names of screenshots to get regions for
 * @param {boolean} options.includeCandidates - Include candidate regions (default: false)
 * @returns {Promise<{ success: boolean, count: number, regionCount: number, error?: string }>}
 */
export async function downloadRegions(options) {
  let { api, workingDir, screenshotNames, includeCandidates = false } = options;

  if (!screenshotNames || screenshotNames.length === 0) {
    return { success: true, count: 0, regionCount: 0 };
  }

  try {
    let response = await api.getRegions(screenshotNames, { includeCandidates });

    if (!response || !response.regions) {
      return { success: false, error: 'API returned no region data' };
    }

    // Save regions to disk
    saveRegionMetadata(workingDir, response.regions, response.summary);

    // Calculate stats
    let count = Object.keys(response.regions).length;
    let regionCount = response.summary?.total_regions || 0;

    return { success: true, count, regionCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract screenshot names from a list of screenshots
 *
 * @param {Array} screenshots - Screenshots with name property
 * @returns {string[]}
 */
export function extractScreenshotNames(screenshots) {
  if (!screenshots || !Array.isArray(screenshots)) {
    return [];
  }

  return screenshots.map(s => s.name).filter(Boolean);
}
