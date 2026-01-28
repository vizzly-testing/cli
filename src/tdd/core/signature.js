/**
 * Screenshot Identity - Signature and Filename Generation
 *
 * CRITICAL: These functions MUST stay in sync with the cloud!
 *
 * Cloud counterpart: vizzly/src/utils/screenshot-identity.js
 *   - generateScreenshotSignature()
 *   - generateBaselineFilename()
 *
 * Contract tests: Both repos have golden tests that must produce identical values:
 *   - Cloud: tests/contracts/signature-parity.test.js
 *   - CLI:   tests/contracts/signature-parity.spec.js
 *
 * If you modify signature or filename generation here, you MUST:
 *   1. Make the same change in the cloud repo
 *   2. Update golden test values in BOTH repos
 *   3. Run contract tests in both repos to verify parity
 *
 * The signature format is: name|viewport_width|browser|custom1|custom2|...
 * The filename format is: {sanitized-name}_{12-char-sha256-hash}.png
 */

import crypto from 'node:crypto';

/**
 * Generate a screenshot signature for baseline matching
 *
 * SYNC WITH: vizzly/src/utils/screenshot-identity.js - generateScreenshotSignature()
 *
 * Uses same logic as cloud: name + viewport_width + browser + custom properties
 *
 * @param {string} name - Screenshot name
 * @param {Object} properties - Screenshot properties (viewport, browser, metadata, etc.)
 * @param {Array<string>} customProperties - Custom property names from project settings
 * @returns {string} Signature like "Login|1920|chrome|iPhone 15 Pro"
 */
export function generateScreenshotSignature(
  name,
  properties = {},
  customProperties = []
) {
  // Match cloud screenshot-identity.js behavior exactly:
  // Always include all default properties (name, viewport_width, browser)
  // even if null/undefined, using empty string as placeholder
  let defaultProperties = ['name', 'viewport_width', 'browser'];
  let allProperties = [...defaultProperties, ...customProperties];

  let parts = allProperties.map(propName => {
    let value;

    if (propName === 'name') {
      value = name;
    } else if (propName === 'viewport_width') {
      // Check for viewport_width as top-level property first (backend format)
      value = properties.viewport_width;
      // Fallback to nested viewport.width (SDK format)
      if (value === null || value === undefined) {
        value = properties.viewport?.width;
      }
    } else if (propName === 'browser') {
      // Normalize browser to lowercase for consistent matching
      // (Playwright reports "firefox", but cloud may store "Firefox")
      value = properties.browser?.toLowerCase?.() ?? properties.browser;
    } else {
      // Custom property - check multiple locations
      value =
        properties[propName] ??
        properties.metadata?.[propName] ??
        properties.metadata?.properties?.[propName];
    }

    // Handle null/undefined values consistently (match cloud behavior)
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string and normalize
    return String(value).trim();
  });

  return parts.join('|');
}

/**
 * Generate a stable, filesystem-safe filename for a screenshot baseline
 * Uses a hash of the signature to avoid character encoding issues
 * Matches the cloud's generateBaselineFilename implementation exactly
 *
 * @param {string} name - Screenshot name
 * @param {string} signature - Full signature string
 * @returns {string} Filename like "homepage_a1b2c3d4e5f6.png"
 */
export function generateBaselineFilename(name, signature) {
  let hash = crypto
    .createHash('sha256')
    .update(signature)
    .digest('hex')
    .slice(0, 12);

  // Sanitize the name for filesystem safety
  let safeName = name
    .replace(/[/\\:*?"<>|]/g, '') // Remove unsafe chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .slice(0, 50); // Limit length

  return `${safeName}_${hash}.png`;
}

/**
 * Generate a stable unique ID from signature for TDD comparisons
 * This allows UI to reference specific variants without database IDs
 *
 * @param {string} signature - Full signature string
 * @returns {string} 16-char hex hash
 */
export function generateComparisonId(signature) {
  return crypto
    .createHash('sha256')
    .update(signature)
    .digest('hex')
    .slice(0, 16);
}
