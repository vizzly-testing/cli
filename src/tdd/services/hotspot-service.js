/**
 * Hotspot Service
 *
 * Functions for downloading and managing hotspot data from the cloud.
 * Hotspots identify regions that frequently change due to dynamic content.
 */

import { saveHotspotMetadata } from '../metadata/hotspot-metadata.js';

/**
 * Download hotspots for screenshots from cloud API
 *
 * @param {Object} options
 * @param {Object} options.api - ApiService instance
 * @param {string} options.workingDir - Working directory
 * @param {string[]} options.screenshotNames - Names of screenshots to get hotspots for
 * @returns {Promise<{ success: boolean, count: number, regionCount: number, error?: string }>}
 */
export async function downloadHotspots(options) {
  let { api, workingDir, screenshotNames } = options;

  if (!screenshotNames || screenshotNames.length === 0) {
    return { success: true, count: 0, regionCount: 0 };
  }

  try {
    let response = await api.getHotspots(screenshotNames);

    if (!response || !response.hotspots) {
      return { success: false, error: 'API returned no hotspot data' };
    }

    // Save hotspots to state storage
    saveHotspotMetadata(workingDir, response.hotspots, response.summary);

    // Calculate stats
    let count = Object.keys(response.hotspots).length;
    let regionCount = Object.values(response.hotspots).reduce(
      (sum, h) => sum + (h.regions?.length || 0),
      0
    );

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
