/**
 * Screenshot Metadata Utilities
 * BearDen Design System
 *
 * Handles extraction and normalization of metadata from screenshot/comparison objects.
 * This module provides a consistent interface for accessing screenshot properties
 * regardless of where they're stored in the data structure.
 *
 * Screenshots can have properties in multiple locations:
 * - Direct properties: screenshot.browser, screenshot.viewport_width, etc.
 * - Metadata object: screenshot.metadata.browser, screenshot.metadata.theme, etc.
 * - Nested properties: screenshot.metadata.properties.theme, etc.
 *
 * User-defined properties from the SDK's `properties` option are merged into
 * the returned metadata object, enabling dimension grouping by custom values
 * like theme, locale, device, etc.
 */

/**
 * Extract all metadata from a screenshot or comparison object
 *
 * @param {Object} screenshot - Screenshot or comparison object
 * @returns {Object} Normalized metadata with all properties flattened
 *
 * @example
 * // Standard comparison object
 * getScreenshotMetadata({
 *   browser: 'chrome',
 *   viewport_width: 1280,
 *   viewport_height: 720,
 *   metadata: { theme: 'dark', locale: 'en-US' }
 * })
 * // Returns: { browser: 'chrome', viewport: '1280x720', viewportWidth: 1280, viewportHeight: 720, theme: 'dark', locale: 'en-US' }
 */
export function getScreenshotMetadata(screenshot) {
  if (!screenshot || typeof screenshot !== 'object') {
    return {};
  }

  let metadata = {
    // Core browser/device info
    browser: null,
    device: null,
    viewport: null,
    viewportWidth: null,
    viewportHeight: null,
  };

  // Extract browser information - check multiple locations
  metadata.browser =
    screenshot.browser ||
    screenshot.metadata?.browser ||
    screenshot.metadata?.properties?.browser ||
    null;

  // Extract device information
  metadata.device = screenshot.metadata?.device || screenshot.device || null;

  // Extract viewport information
  if (screenshot.viewport_width && screenshot.viewport_height) {
    metadata.viewportWidth = screenshot.viewport_width;
    metadata.viewportHeight = screenshot.viewport_height;
    metadata.viewport = `${screenshot.viewport_width}x${screenshot.viewport_height}`;
  } else if (screenshot.width && screenshot.height) {
    metadata.viewportWidth = screenshot.width;
    metadata.viewportHeight = screenshot.height;
    metadata.viewport = `${screenshot.width}x${screenshot.height}`;
  } else if (screenshot.metadata?.viewport) {
    metadata.viewport = screenshot.metadata.viewport;
    let parts = screenshot.metadata.viewport.split('x');
    if (parts.length === 2) {
      let [width, height] = parts.map(Number);
      if (!Number.isNaN(width) && !Number.isNaN(height)) {
        metadata.viewportWidth = width;
        metadata.viewportHeight = height;
      }
    }
  }

  // Merge additional properties from metadata field
  if (screenshot.metadata && typeof screenshot.metadata === 'object') {
    // Add all custom properties from metadata, excluding core ones
    Object.entries(screenshot.metadata).forEach(([key, value]) => {
      if (
        ![
          'browser',
          'device',
          'viewport',
          'viewportWidth',
          'viewportHeight',
          'properties',
        ].includes(key) &&
        value != null &&
        typeof key === 'string' &&
        typeof value !== 'object'
      ) {
        metadata[key] = value;
      }
    });

    // Extract properties from nested metadata.properties
    if (
      screenshot.metadata.properties &&
      typeof screenshot.metadata.properties === 'object'
    ) {
      Object.entries(screenshot.metadata.properties).forEach(([key, value]) => {
        if (
          ![
            'browser',
            'device',
            'viewport',
            'viewportWidth',
            'viewportHeight',
          ].includes(key) &&
          value != null &&
          typeof key === 'string' &&
          typeof value !== 'object'
        ) {
          metadata[key] = value;
        }
      });
    }
  }

  return metadata;
}

/**
 * Get a formatted viewport display string
 *
 * @param {Object} screenshot - Screenshot or comparison object
 * @returns {string|null} Formatted viewport string like "1280×720"
 */
export function getViewportDisplay(screenshot) {
  let metadata = getScreenshotMetadata(screenshot);

  if (metadata.viewport) {
    return metadata.viewport.replace('x', '×');
  }

  if (metadata.viewportWidth && metadata.viewportHeight) {
    return `${metadata.viewportWidth}×${metadata.viewportHeight}`;
  }

  return null;
}

/**
 * Get unique values for a specific property across multiple screenshots
 *
 * @param {Array} screenshots - Array of screenshot/comparison objects
 * @param {string} propertyKey - Property key to extract
 * @returns {Array} Sorted array of unique values
 */
export function getUniquePropertyValues(screenshots, propertyKey) {
  let values = new Set();

  screenshots.forEach(screenshot => {
    let metadata = getScreenshotMetadata(screenshot);
    let value = metadata[propertyKey];
    if (value != null && value !== '') {
      values.add(String(value));
    }
  });

  return Array.from(values).sort();
}

/**
 * Normalize a property key for display (camelCase to Title Case)
 *
 * @param {string} key - Property key
 * @returns {string} Formatted display label
 */
export function normalizePropertyKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}
