/**
 * Viewport parsing and manipulation utilities
 * Pure functions for viewport handling
 */

/**
 * Parse viewport string into viewport object
 * @param {string} viewportStr - Viewport string in format "name:WxH" (e.g., "mobile:375x667")
 * @returns {Object|null} Viewport object { name, width, height } or null if invalid
 */
export function parseViewport(viewportStr) {
  if (!viewportStr || typeof viewportStr !== 'string') {
    return null;
  }

  // Remove all spaces and parse
  let cleaned = viewportStr.replace(/\s+/g, '');
  let match = cleaned.match(/^([^:]+):(\d+)x(\d+)$/);

  if (!match) {
    return null;
  }

  let [, name, width, height] = match;

  return {
    name,
    width: parseInt(width, 10),
    height: parseInt(height, 10),
  };
}

/**
 * Format viewport object into string
 * @param {Object} viewport - Viewport object with name, width, height
 * @returns {string} Formatted viewport string "name:WxH"
 */
export function formatViewport(viewport) {
  if (!viewport?.name || !viewport?.width || !viewport?.height) {
    return '';
  }

  return `${viewport.name}:${viewport.width}x${viewport.height}`;
}

/**
 * Set viewport on Puppeteer page
 * @param {Object} page - Puppeteer page instance
 * @param {Object} viewport - Viewport object { width, height }
 * @returns {Promise<void>}
 */
export async function setViewport(page, viewport) {
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
  });
}

/**
 * Get common viewport presets
 * @returns {Array<Object>} Array of common viewport configurations
 */
export function getCommonViewports() {
  return [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'mobile-landscape', width: 667, height: 375 },
    { name: 'tablet-landscape', width: 1024, height: 768 },
  ];
}
