/**
 * @module image-input-detector
 * @description Utilities for detecting whether a string is a base64 image or a file path
 */

/**
 * Check if a string is valid base64 encoded data
 *
 * Base64 strings consist only of:
 * - A-Z, a-z, 0-9, +, /
 * - Optional padding with = at the end
 * - Must be in groups of 4 characters (with optional 2-3 char group at end with padding)
 *
 * @param {string} str - String to check
 * @returns {boolean} True if the string appears to be valid base64
 *
 * @example
 * isBase64('ZmFrZS1wbmctZGF0YQ==') // true
 * isBase64('./screenshot.png') // false
 * isBase64('/absolute/path.png') // false
 */
export function isBase64(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }

  // Strip data URI prefix if present (e.g., data:image/png;base64,...)
  let base64Content = str;
  if (str.startsWith('data:')) {
    let match = str.match(/^data:[a-zA-Z0-9+/.-]+;base64,(.+)$/);
    if (!match) {
      return false; // Has data: prefix but invalid format
    }
    base64Content = match[1];
  }

  // Quick check: base64 only contains these characters
  // Use a simple character class check instead of a complex regex to avoid
  // catastrophic backtracking on large strings
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Content)) {
    return false;
  }

  // Check length is valid (must be multiple of 4, accounting for padding)
  let len = base64Content.length;
  if (len % 4 !== 0) {
    return false;
  }

  // Check padding is valid (only at end, max 2 = chars)
  let paddingMatch = base64Content.match(/=+$/);
  if (paddingMatch && paddingMatch[0].length > 2) {
    return false;
  }

  return true;
}

/**
 * Check if a string looks like a file path
 *
 * Detects common file path patterns across platforms:
 * - Relative paths: ./file.png, ../file.png, subdirectory/file.png
 * - Absolute Unix paths: /absolute/path/file.png
 * - Absolute Windows paths: C:\path\file.png, C:/path/file.png
 * - File URIs: file:///path/to/file.png
 * - Paths with common image extensions
 *
 * Note: This is heuristic-based and doesn't check file existence
 *
 * @param {string} str - String to check
 * @returns {boolean} True if the string looks like a file path
 *
 * @example
 * looksLikeFilePath('./screenshot.png') // true
 * looksLikeFilePath('/abs/path/file.png') // true
 * looksLikeFilePath('C:\\Windows\\file.png') // true
 * looksLikeFilePath('ZmFrZS1wbmctZGF0YQ==') // false
 */
export function looksLikeFilePath(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }

  // 0. Length check - file paths are short, base64 screenshots are huge
  // Even the longest realistic file path is < 500 chars
  // This makes detection O(1) for large base64 strings
  // Use same threshold (1000) as detectImageInputType for consistency
  if (str.length > 1000) {
    return false;
  }

  // 1. Explicitly reject data URIs (they contain : and / which would match path patterns)
  if (str.startsWith('data:')) {
    return false;
  }

  // 2. Check for file:// URI scheme
  if (str.startsWith('file://')) {
    return true;
  }

  // 3. Windows absolute paths (C:\ or C:/) - base64 never starts with drive letter
  if (/^[A-Za-z]:[/\\]/.test(str)) {
    return true;
  }

  // 4. Relative path indicators (./ or ../) - base64 never starts with dot
  if (/^\.\.?[/\\]/.test(str)) {
    return true;
  }

  // 5. Check for common image file extensions
  // This is the safest check - base64 never ends with .png/.jpg/etc
  // Catches: /path/file.png, subdir/file.png, file.png
  if (/\.(png|jpe?g|gif|webp|bmp|svg|tiff?|ico)$/i.test(str)) {
    return true;
  }

  // Note: We intentionally don't check for bare "/" prefix or "/" anywhere
  // because JPEG base64 starts with "/9j/" which would false-positive
  // File paths without extensions are rare for images and will fall through
  // to base64 detection, which is acceptable for backwards compat

  return false;
}

/**
 * Detect the type of image input
 *
 * Determines whether a string input is:
 * - 'base64': Base64 encoded image data
 * - 'file-path': A file path (relative or absolute)
 * - 'unknown': Cannot determine (ambiguous or invalid)
 *
 * Strategy (optimized for performance):
 * 1. Check for data URI prefix first (O(1), definitive)
 * 2. Check file path patterns (O(1) prefix/suffix checks)
 * 3. For large non-path strings, assume base64 (skip expensive validation)
 * 4. Only run full base64 validation on small ambiguous strings
 *
 * This avoids O(n) regex validation on large screenshot buffers.
 *
 * @param {string} str - String to detect
 * @returns {'base64' | 'file-path' | 'unknown'} Detected input type
 *
 * @example
 * detectImageInputType('./screenshot.png') // 'file-path'
 * detectImageInputType('ZmFrZS1wbmctZGF0YQ==') // 'base64'
 * detectImageInputType('data:image/png;base64,iVBOR...') // 'base64'
 * detectImageInputType('C:\\path\\image.png') // 'file-path'
 * detectImageInputType('invalid!!!') // 'unknown'
 */
export function detectImageInputType(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return 'unknown';
  }

  // 1. Data URIs are definitively base64 (O(1) check)
  if (str.startsWith('data:')) {
    return 'base64';
  }

  // 2. Check file path patterns (O(1) prefix/suffix checks)
  if (looksLikeFilePath(str)) {
    return 'file-path';
  }

  // 3. For large strings that aren't file paths, assume base64
  // Screenshots are typically 100KB+ as base64, file paths are <1KB
  // Skip expensive O(n) validation for large strings
  if (str.length > 1000) {
    return 'base64';
  }

  // 4. Full validation only for small ambiguous strings
  if (isBase64(str)) {
    return 'base64';
  }

  return 'unknown';
}
