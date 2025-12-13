/**
 * Hotspot Metadata I/O
 *
 * Functions for reading and writing hotspot data files.
 * Hotspots identify regions of screenshots that frequently change
 * due to dynamic content (timestamps, animations, etc.).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load hotspot data from disk
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @returns {Object|null} Hotspot data keyed by screenshot name, or null if not found
 */
export function loadHotspotMetadata(workingDir) {
  let hotspotsPath = join(workingDir, '.vizzly', 'hotspots.json');

  if (!existsSync(hotspotsPath)) {
    return null;
  }

  try {
    let content = readFileSync(hotspotsPath, 'utf8');
    let data = JSON.parse(content);
    return data.hotspots || null;
  } catch {
    // Return null for parse/read errors
    return null;
  }
}

/**
 * Save hotspot data to disk
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @param {Object} hotspotData - Hotspot data keyed by screenshot name
 * @param {Object} summary - Summary information about the hotspots
 */
export function saveHotspotMetadata(workingDir, hotspotData, summary = {}) {
  let vizzlyDir = join(workingDir, '.vizzly');

  // Ensure directory exists
  if (!existsSync(vizzlyDir)) {
    mkdirSync(vizzlyDir, { recursive: true });
  }

  let hotspotsPath = join(vizzlyDir, 'hotspots.json');
  let content = {
    downloadedAt: new Date().toISOString(),
    summary,
    hotspots: hotspotData,
  };

  writeFileSync(hotspotsPath, JSON.stringify(content, null, 2));
}

/**
 * Get hotspot for a specific screenshot with caching support
 *
 * This is a pure function that takes a cache object as parameter
 * for stateless operation. The cache is mutated if data needs to be loaded.
 *
 * @param {Object} cache - Cache object { data: Object|null, loaded: boolean }
 * @param {string} workingDir - Working directory
 * @param {string} screenshotName - Name of the screenshot
 * @returns {Object|null} Hotspot analysis or null if not available
 */
export function getHotspotForScreenshot(cache, workingDir, screenshotName) {
  // Check cache first
  if (cache.data?.[screenshotName]) {
    return cache.data[screenshotName];
  }

  // Load from disk if not yet loaded
  if (!cache.loaded) {
    cache.data = loadHotspotMetadata(workingDir);
    cache.loaded = true;
  }

  return cache.data?.[screenshotName] || null;
}

/**
 * Create an empty hotspot cache object
 *
 * @returns {{ data: null, loaded: boolean }}
 */
export function createHotspotCache() {
  return { data: null, loaded: false };
}
