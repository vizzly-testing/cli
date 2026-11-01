import crypto from 'node:crypto';

/**
 * Compute SHA256 hash of buffer
 * @param {Buffer} buffer - Data to hash
 * @returns {string} Hex-encoded SHA256 hash
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Partition screenshots by SHA existence
 * @param {Array<Object>} screenshots - Screenshots with sha256 property
 * @param {Set<string>|Array<string>} existingShas - SHAs that already exist
 * @returns {Object} { toUpload, existing } partitioned arrays
 */
export function partitionByShaExistence(screenshots, existingShas) {
  let existingSet =
    existingShas instanceof Set ? existingShas : new Set(existingShas);

  let toUpload = [];
  let existing = [];

  for (let screenshot of screenshots) {
    if (existingSet.has(screenshot.sha256)) {
      existing.push(screenshot);
    } else {
      toUpload.push(screenshot);
    }
  }

  return { toUpload, existing };
}

/**
 * Check if SHA check result indicates file exists
 * @param {Object} checkResult - Result from checkShas endpoint
 * @param {string} sha256 - SHA to check
 * @returns {boolean} True if file exists
 */
export function shaExists(checkResult, sha256) {
  return checkResult?.existing?.includes(sha256) ?? false;
}

/**
 * Find screenshot record from SHA check result
 * @param {Object} checkResult - Result from checkShas endpoint
 * @param {string} sha256 - SHA to find
 * @returns {Object|null} Screenshot record or null
 */
export function findScreenshotBySha(checkResult, sha256) {
  return checkResult?.screenshots?.find(s => s.sha256 === sha256) ?? null;
}
