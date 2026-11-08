/**
 * Read the visual comparison result.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {string|null} The visual result when the API supplied one.
 */
export function getComparisonResult(comparison = {}) {
  return comparison.result || null;
}

/**
 * Read the current screenshot name.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {string|null} The screenshot name when the API supplied one.
 */
export function getComparisonName(comparison = {}) {
  return comparison.screenshot?.name || null;
}

/**
 * Read CSS viewport dimensions without confusing them with bitmap size.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {{width: number|null, height: number|null}|null} Viewport dimensions.
 */
export function getComparisonViewport(comparison = {}) {
  let viewport = comparison.screenshot?.viewport || {};
  let width = viewport.width ?? null;
  let height = viewport.height ?? null;

  return width != null || height != null ? { width, height } : null;
}

/**
 * Read the browser from the current screenshot.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {string|null} The browser name when present.
 */
export function getComparisonBrowser(comparison = {}) {
  return comparison.screenshot?.browser || null;
}
