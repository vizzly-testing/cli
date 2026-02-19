/**
 * Hotspot Metadata I/O
 *
 * Functions for reading and writing hotspot metadata in state storage.
 * Hotspots identify regions of screenshots that frequently change
 * due to dynamic content (timestamps, animations, etc.).
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
 * Load hotspot data from state storage
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @returns {Object|null} Hotspot data keyed by screenshot name, or null if not found
 */
export function loadHotspotMetadata(workingDir) {
  return withStateStore(workingDir, store => {
    try {
      return store.getHotspotMetadata();
    } catch {
      return null;
    }
  });
}

/**
 * Save hotspot data to state storage
 *
 * @param {string} workingDir - Working directory containing .vizzly folder
 * @param {Object} hotspotData - Hotspot data keyed by screenshot name
 * @param {Object} summary - Summary information about the hotspots
 */
export function saveHotspotMetadata(workingDir, hotspotData, summary = {}) {
  withStateStore(workingDir, store => {
    store.setHotspotMetadata(hotspotData, summary);
  });
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
  if (cache.data?.[screenshotName]) {
    return cache.data[screenshotName];
  }

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
