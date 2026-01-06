/**
 * Pattern matching utilities for page filtering
 * Pure functions for glob-like pattern matching
 */

/**
 * Check if a string matches a glob-like pattern
 * Supports wildcards: * (any characters), ** (any path segments)
 * @param {string} str - String to test
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} True if string matches pattern
 */
export function matchPattern(str, pattern) {
  if (!pattern) return true;
  if (!str) return false;

  // Escape special regex characters except * and /
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // Replace ** with a placeholder
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    // Replace * with regex for any characters except /
    .replace(/\*/g, '[^/]*')
    // Replace placeholder with regex for any characters including /
    .replace(/__DOUBLE_STAR__/g, '.*');

  let regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Check if path matches any pattern in a list
 * @param {string} path - Path to test
 * @param {string|string[]} patterns - Single pattern or array of patterns
 * @returns {boolean} True if path matches any pattern
 */
function matchAnyPattern(path, patterns) {
  let patternList = Array.isArray(patterns) ? patterns : [patterns];
  return patternList.some(pattern => matchPattern(path, pattern));
}

/**
 * Filter pages by include and exclude patterns
 * @param {Array<Object>} pages - Array of page objects with path property
 * @param {string|string[]|null} includePattern - Include pattern(s)
 * @param {string|string[]|null} excludePattern - Exclude pattern(s)
 * @returns {Array<Object>} Filtered pages
 */
export function filterByPattern(pages, includePattern, excludePattern) {
  return pages.filter(page => {
    let path = page.path || page.url;

    // Check include pattern - page must match at least one
    if (includePattern && !matchAnyPattern(path, includePattern)) {
      return false;
    }

    // Check exclude pattern - page must not match any
    if (excludePattern && matchAnyPattern(path, excludePattern)) {
      return false;
    }

    return true;
  });
}

/**
 * Find matching interaction hook for a page
 * Patterns are tried in order, first match wins
 * @param {Object} page - Page object with path/url
 * @param {Object} interactions - Interactions config object with pattern keys
 * @returns {Function|null} Matching interaction function or null
 */
export function findMatchingHook(page, interactions) {
  if (!interactions) {
    return null;
  }

  let path = page.path || page.url;

  // Handle simple object map format: { pattern: hook }
  if (Object.keys(interactions).length === 0) {
    return null;
  }

  for (let [pattern, hook] of Object.entries(interactions)) {
    if (matchPattern(path, pattern)) {
      return hook;
    }
  }

  return null;
}
