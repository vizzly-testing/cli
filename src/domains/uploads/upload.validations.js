/**
 * Validate API key is present
 * @param {string|undefined} apiKey - API key to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateApiKey(apiKey) {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }
  return { valid: true, error: null };
}

/**
 * Validate screenshots directory path
 * @param {string|undefined} screenshotsDir - Directory path
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateScreenshotsDir(screenshotsDir) {
  if (!screenshotsDir) {
    return { valid: false, error: 'Screenshots directory is required' };
  }
  return { valid: true, error: null };
}

/**
 * Validate directory stats
 * @param {Object} stats - fs.stat result
 * @param {string} path - Directory path for error message
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDirectoryStats(stats, path) {
  if (!stats.isDirectory()) {
    return { valid: false, error: `${path} is not a directory` };
  }
  return { valid: true, error: null };
}

/**
 * Validate files were found
 * @param {Array} files - Array of file paths
 * @param {string} directory - Directory that was searched
 * @returns {{ valid: boolean, error: string|null, context?: Object }}
 */
export function validateFilesFound(files, directory) {
  if (!files || files.length === 0) {
    return {
      valid: false,
      error: 'No screenshot files found',
      context: { directory, pattern: '**/*.png' },
    };
  }
  return { valid: true, error: null };
}
