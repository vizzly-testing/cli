import { buildEndpointWithParams } from '../../services/cloud-protocol.js';

/**
 * Get a build context bundle at the detail level the caller can consume.
 *
 * Passing detail selection to the API keeps compact callers from downloading
 * raw Honeydiff geometry by default while preserving the unfiltered endpoint
 * for raw and full context consumers.
 *
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {Object} options - Optional query params
 * @returns {Promise<Object>} Build context bundle
 */
export async function getBuildContext(client, buildId, options = {}) {
  let endpoint = buildEndpointWithParams(
    `/api/sdk/context/builds/${buildId}`,
    options
  );
  return client.request(endpoint);
}

/**
 * Get comparison context bundle with similarity and history
 * @param {Object} client - API client
 * @param {string} comparisonId - Comparison ID
 * @param {Object} options - Optional query params
 * @returns {Promise<Object>} Comparison context bundle
 */
export async function getComparisonContext(client, comparisonId, options = {}) {
  let endpoint = buildEndpointWithParams(
    `/api/sdk/context/comparisons/${comparisonId}`,
    options
  );
  return client.request(endpoint);
}

/**
 * Get screenshot context bundle for a screenshot name
 * @param {Object} client - API client
 * @param {string} screenshotName - Screenshot name
 * @param {Object} options - Optional query params
 * @returns {Promise<Object>} Screenshot context bundle
 */
export async function getScreenshotContext(
  client,
  screenshotName,
  options = {}
) {
  let encodedName = encodeURIComponent(screenshotName);
  let endpoint = buildEndpointWithParams(
    `/api/sdk/context/screenshots/${encodedName}`,
    options
  );
  return client.request(endpoint);
}

/**
 * Get project-scoped similar comparisons for a fingerprint hash
 * @param {Object} client - API client
 * @param {string} fingerprintHash - Honeydiff fingerprint hash
 * @param {Object} options - Optional query params
 * @returns {Promise<Object>} Fingerprint context bundle
 */
export async function getSimilarFingerprintContext(
  client,
  fingerprintHash,
  options = {}
) {
  let encodedFingerprint = encodeURIComponent(fingerprintHash);
  let endpoint = buildEndpointWithParams(
    `/api/sdk/context/fingerprints/${encodedFingerprint}/similar`,
    options
  );
  return client.request(endpoint);
}

/**
 * Get pending review queue context for a project
 * @param {Object} client - API client
 * @param {Object} options - Optional query params
 * @returns {Promise<Object>} Review queue context bundle
 */
export async function getReviewQueueContext(client, options = {}) {
  let endpoint = buildEndpointWithParams(
    '/api/sdk/context/review-queue',
    options
  );
  return client.request(endpoint);
}

/**
 * Get token context (organization and project info)
 * @param {Object} client - API client
 * @returns {Promise<Object>} Token context data
 */
export async function getTokenContext(client) {
  return client.request('/api/sdk/token/context');
}
