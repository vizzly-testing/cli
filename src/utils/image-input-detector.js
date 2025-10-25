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
    const match = str.match(/^data:[a-zA-Z0-9+/.-]+;base64,(.+)$/);
    if (!match) {
      return false; // Has data: prefix but invalid format
    }
    base64Content = match[1];
  }

  // Base64 regex: groups of 4 chars [A-Za-z0-9+/], with optional padding
  // Valid endings: no padding, or 2/3 chars + padding (= or ==)
  const base64Pattern =
    /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

  return base64Pattern.test(base64Content);
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

  // 0. Explicitly reject data URIs first (they contain : and / which would match path patterns)
  if (str.startsWith('data:')) {
    return false;
  }

  // 1. Check for file:// URI scheme
  if (str.startsWith('file://')) {
    return true;
  }

  // 2. Check for absolute paths (Unix or Windows)
  // Unix: starts with /
  // Windows: starts with drive letter like C:\ or C:/
  if (str.startsWith('/') || /^[A-Za-z]:[/\\]/.test(str)) {
    return true;
  }

  // 3. Check for relative path indicators
  // ./ or ../ or .\ or ..\
  if (/^\.\.?[/\\]/.test(str)) {
    return true;
  }

  // 4. Check for path separators (forward or back slash)
  // This catches paths like: subdirectory/file.png or subdirectory\file.png
  if (/[/\\]/.test(str)) {
    return true;
  }

  // 5. Check for common image file extensions
  // This catches simple filenames like: screenshot.png
  // Common extensions: png, jpg, jpeg, gif, webp, bmp, svg, tiff, ico
  if (/\.(png|jpe?g|gif|webp|bmp|svg|tiff?|ico)$/i.test(str)) {
    return true;
  }

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
 * Strategy:
 * 1. First check if it's valid base64 (can contain / which might look like paths)
 * 2. Then check if it looks like a file path (more specific patterns)
 * 3. Otherwise return 'unknown'
 *
 * This order prevents base64 strings (which can contain /) from being
 * misidentified as file paths. Base64 validation is stricter and should
 * be checked first.
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

  // Check base64 FIRST - base64 strings can contain / which looks like paths
  // Base64 validation is stricter and more deterministic
  if (isBase64(str)) {
    return 'base64';
  }

  // Then check file path - catch patterns that aren't valid base64
  if (looksLikeFilePath(str)) {
    return 'file-path';
  }

  return 'unknown';
}
