/**
 * Region Metadata I/O
 *
 * Functions for reading and writing user-defined hotspot region data.
 * Regions are 2D bounding boxes that users have confirmed as dynamic content areas.
 */

import { createStateStore } from '../state-store.js';

function withStateStore(workingDir, operation) {
  let store = createStateStore({ workingDir });

  try {
    return operation(store);
  } finally {
    store.close();
  }
}

/**
 * Load region data from state storage
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @returns {Object|null} Region data keyed by screenshot name, or null if not found
 */
export function loadRegionMetadata(workingDir) {
  return withStateStore(workingDir, store => {
    try {
      return store.getRegionMetadata();
    } catch {
      return null;
    }
  });
}

/**
 * Save region data to state storage
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @param {Object} regionData - Region data keyed by screenshot name
 * @param {Object} summary - Summary information about the regions
 */
export function saveRegionMetadata(workingDir, regionData, summary = {}) {
  withStateStore(workingDir, store => {
    store.setRegionMetadata(regionData, summary);
  });
}

/**
 * Get regions for a specific screenshot with caching support
 *
 * This is a pure function that takes a cache object as parameter
 * for stateless operation. The cache is mutated if data needs to be loaded.
 *
 * @param {Object} cache - Cache object { data: Object|null, loaded: boolean }
 * @param {string} workingDir - Working directory
 * @param {string} screenshotName - Name of the screenshot
 * @returns {Object|null} Region data or null if not available
 */
export function getRegionsForScreenshot(cache, workingDir, screenshotName) {
  if (cache.data?.[screenshotName]) {
    return cache.data[screenshotName];
  }

  if (!cache.loaded) {
    cache.data = loadRegionMetadata(workingDir);
    cache.loaded = true;
  }

  return cache.data?.[screenshotName] || null;
}

/**
 * Create an empty region cache object
 *
 * @returns {{ data: null, loaded: boolean }}
 */
export function createRegionCache() {
  return { data: null, loaded: false };
}
