import crypto from 'node:crypto';

/**
 * Compute SHA256 hash of a buffer
 * @param {Buffer} buffer - File buffer
 * @returns {string} Hex-encoded SHA256 hash
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Partition files into those that need upload and those that exist
 * @param {Array} fileMetadata - All file metadata
 * @param {Set} existingShas - Set of SHAs that already exist
 * @returns {{ toUpload: Array, existing: Array }}
 */
export function partitionFilesByExistence(fileMetadata, existingShas) {
  return {
    toUpload: fileMetadata.filter(f => !existingShas.has(f.sha256)),
    existing: fileMetadata.filter(f => existingShas.has(f.sha256)),
  };
}

/**
 * Build glob pattern for screenshots
 * @param {string} directory - Base directory
 * @returns {string} Glob pattern
 */
export function buildScreenshotPattern(directory) {
  return `${directory}/**/*.png`;
}
