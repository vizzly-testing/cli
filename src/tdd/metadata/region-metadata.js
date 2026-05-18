/**
 * Region Metadata I/O
 *
 * Functions for reading and writing user-defined hotspot region data.
 * Regions are 2D bounding boxes that users have confirmed as dynamic content areas.
 * Unlike historical hotspots (1D Y-bands), these are explicit definitions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load region data from disk
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @returns {Object|null} Region data keyed by screenshot name, or null if not found
 */
export function loadRegionMetadata(workingDir) {
  let regionsPath = join(workingDir, '.vizzly', 'regions.json');

  if (!existsSync(regionsPath)) {
    return null;
  }

  try {
    let content = readFileSync(regionsPath, 'utf8');
    let data = JSON.parse(content);
    return data.regions || null;
  } catch {
    // Return null for parse/read errors
    return null;
  }
}

/**
 * Save region data to disk
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @param {Object} regionData - Region data keyed by screenshot name
 * @param {Object} summary - Summary information about the regions
 */
export function saveRegionMetadata(workingDir, regionData, summary = {}) {
  let vizzlyDir = join(workingDir, '.vizzly');

  // Ensure directory exists
  if (!existsSync(vizzlyDir)) {
    mkdirSync(vizzlyDir, { recursive: true });
  }

  let regionsPath = join(vizzlyDir, 'regions.json');
  let content = {
    downloadedAt: new Date().toISOString(),
    summary,
    regions: regionData,
  };

  writeFileSync(regionsPath, JSON.stringify(content, null, 2));
}
