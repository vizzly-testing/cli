/**
 * API Endpoints - Functions for each API operation
 *
 * Each function takes a client as the first parameter and returns the API result.
 * This keeps the functions pure (no hidden state) and easily testable.
 */

import { VizzlyError } from '../errors/vizzly-error.js';
import * as output from '../utils/output.js';
import {
  buildBuildPayload,
  buildEndpointWithParams,
  buildQueryParams,
  buildScreenshotCheckObject,
  buildScreenshotPayload,
  buildShaCheckPayload,
  computeSha256,
  findScreenshotBySha,
  shaExists,
} from './core.js';

// ============================================================================
// Build Endpoints
// ============================================================================

/**
 * Get build information
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {string|null} include - Optional include parameter (e.g., 'screenshots')
 * @returns {Promise<Object>} Build data
 */
export async function getBuild(client, buildId, include = null) {
  let endpoint = `/api/sdk/builds/${buildId}`;
  if (include) {
    endpoint = buildEndpointWithParams(endpoint, { include });
  }
  return client.request(endpoint);
}

/**
 * Get builds for a project
 * @param {Object} client - API client
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} List of builds
 */
export async function getBuilds(client, filters = {}) {
  let query = buildQueryParams(filters);
  let endpoint = `/api/sdk/builds${query ? `?${query}` : ''}`;
  return client.request(endpoint);
}

/**
 * Create a new build
 * @param {Object} client - API client
 * @param {Object} metadata - Build metadata
 * @returns {Promise<Object>} Created build data
 */
export async function createBuild(client, metadata) {
  let payload = buildBuildPayload(metadata);
  return client.request('/api/sdk/builds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ build: payload }),
  });
}

/**
 * Update build status
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {string} status - Build status (pending|running|completed|failed)
 * @param {number|null} executionTimeMs - Execution time in milliseconds
 * @returns {Promise<Object>} Updated build data
 */
export async function updateBuildStatus(
  client,
  buildId,
  status,
  executionTimeMs = null
) {
  let body = { status };
  if (executionTimeMs != null) {
    body.executionTimeMs = executionTimeMs;
  }

  return client.request(`/api/sdk/builds/${buildId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Finalize a build (convenience wrapper for updateBuildStatus)
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {boolean} success - Whether the build succeeded
 * @param {number|null} executionTimeMs - Execution time in milliseconds
 * @returns {Promise<Object>} Finalized build data
 */
export async function finalizeBuild(
  client,
  buildId,
  success = true,
  executionTimeMs = null
) {
  let status = success ? 'completed' : 'failed';
  return updateBuildStatus(client, buildId, status, executionTimeMs);
}

/**
 * Get TDD baselines for a build
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @returns {Promise<Object>} { build, screenshots, signatureProperties }
 */
export async function getTddBaselines(client, buildId) {
  return client.request(`/api/sdk/builds/${buildId}/tdd-baselines`);
}

// ============================================================================
// Screenshot Endpoints
// ============================================================================

/**
 * Check if SHAs already exist on the server
 * @param {Object} client - API client
 * @param {Array} screenshots - Screenshots to check (objects with sha256, or string SHAs)
 * @param {string} buildId - Build ID for screenshot record creation
 * @returns {Promise<Object>} { existing, missing, screenshots }
 */
export async function checkShas(client, screenshots, buildId) {
  try {
    let payload = buildShaCheckPayload(screenshots, buildId);
    return await client.request('/api/sdk/check-shas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Continue without deduplication on error
    output.debug('sha-check', 'failed, continuing without deduplication', {
      error: error.message,
    });

    // Extract SHAs for fallback response
    let shaList =
      Array.isArray(screenshots) &&
      screenshots.length > 0 &&
      typeof screenshots[0] === 'object'
        ? screenshots.map(s => s.sha256)
        : screenshots;

    return { existing: [], missing: shaList, screenshots: [] };
  }
}

/**
 * Upload a screenshot with SHA deduplication
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {string} name - Screenshot name
 * @param {Buffer} buffer - Screenshot data
 * @param {Object} metadata - Additional metadata
 * @param {boolean} skipDedup - Skip SHA deduplication (uploadAll mode)
 * @returns {Promise<Object>} Upload result
 */
export async function uploadScreenshot(
  client,
  buildId,
  name,
  buffer,
  metadata = {},
  skipDedup = false
) {
  // Skip SHA deduplication if requested
  if (skipDedup) {
    let payload = buildScreenshotPayload(name, buffer, metadata);
    return client.request(`/api/sdk/builds/${buildId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Normal flow with SHA deduplication
  let sha256 = computeSha256(buffer);
  let checkObj = buildScreenshotCheckObject(sha256, name, metadata);
  let checkResult = await checkShas(client, [checkObj], buildId);

  if (shaExists(checkResult, sha256)) {
    // File already exists, screenshot record was automatically created
    let screenshot = findScreenshotBySha(checkResult, sha256);
    return {
      message: 'Screenshot already exists, skipped upload',
      sha256,
      skipped: true,
      screenshot,
      fromExisting: true,
    };
  }

  // File doesn't exist, proceed with upload
  let payload = buildScreenshotPayload(name, buffer, metadata, sha256);
  return client.request(`/api/sdk/builds/${buildId}/screenshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// Comparison Endpoints
// ============================================================================

/**
 * Get comparison information
 * @param {Object} client - API client
 * @param {string} comparisonId - Comparison ID
 * @returns {Promise<Object>} Comparison data
 */
export async function getComparison(client, comparisonId) {
  let response = await client.request(`/api/sdk/comparisons/${comparisonId}`);
  return response.comparison;
}

/**
 * Search for comparisons by name
 * @param {Object} client - API client
 * @param {string} name - Screenshot name to search for
 * @param {Object} filters - Optional filters (branch, limit, offset)
 * @returns {Promise<Object>} Search results with comparisons and pagination
 */
export async function searchComparisons(client, name, filters = {}) {
  if (!name || typeof name !== 'string') {
    throw new VizzlyError('name is required and must be a non-empty string');
  }

  let { branch, limit = 50, offset = 0 } = filters;
  let params = { name, limit: String(limit), offset: String(offset) };
  if (branch) params.branch = branch;

  let endpoint = buildEndpointWithParams('/api/sdk/comparisons/search', params);
  return client.request(endpoint);
}

// ============================================================================
// Hotspot Endpoints
// ============================================================================

/**
 * Get hotspot analysis for a single screenshot
 * @param {Object} client - API client
 * @param {string} screenshotName - Screenshot name
 * @param {Object} options - Optional settings
 * @returns {Promise<Object>} Hotspot analysis data
 */
export async function getScreenshotHotspots(
  client,
  screenshotName,
  options = {}
) {
  let { windowSize = 20 } = options;
  let encodedName = encodeURIComponent(screenshotName);
  let endpoint = buildEndpointWithParams(
    `/api/sdk/screenshots/${encodedName}/hotspots`,
    {
      windowSize: String(windowSize),
    }
  );
  return client.request(endpoint);
}

/**
 * Batch get hotspot analysis for multiple screenshots
 * @param {Object} client - API client
 * @param {string[]} screenshotNames - Array of screenshot names
 * @param {Object} options - Optional settings
 * @returns {Promise<Object>} Hotspots keyed by screenshot name
 */
export async function getBatchHotspots(client, screenshotNames, options = {}) {
  let { windowSize = 20 } = options;
  return client.request('/api/sdk/screenshots/hotspots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      screenshot_names: screenshotNames,
      windowSize,
    }),
  });
}

// ============================================================================
// Auth/Token Endpoints
// ============================================================================

/**
 * Get token context (organization and project info)
 * @param {Object} client - API client
 * @returns {Promise<Object>} Token context data
 */
export async function getTokenContext(client) {
  return client.request('/api/sdk/token/context');
}

// ============================================================================
// Parallel Build Endpoints
// ============================================================================

/**
 * Finalize a parallel build
 * @param {Object} client - API client
 * @param {string} parallelId - Parallel ID to finalize
 * @returns {Promise<Object>} Finalization result
 */
export async function finalizeParallelBuild(client, parallelId) {
  return client.request(`/api/sdk/parallel/${parallelId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Preview Endpoints
// ============================================================================

/**
 * Upload preview ZIP file for a build
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {Buffer} zipBuffer - ZIP file contents
 * @returns {Promise<Object>} Upload result with preview URL
 */
export async function uploadPreviewZip(client, buildId, zipBuffer) {
  // Use native FormData (Node 18+) with Blob for proper fetch compatibility
  let formData = new FormData();
  let blob = new Blob([zipBuffer], { type: 'application/zip' });
  formData.append('file', blob, 'preview.zip');

  return client.request(`/api/sdk/builds/${buildId}/preview/upload-zip`, {
    method: 'POST',
    body: formData,
    // Let fetch set the Content-Type with boundary automatically
  });
}

/**
 * Get preview info for a build
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @returns {Promise<Object>} Preview info or null if not found
 */
export async function getPreviewInfo(client, buildId) {
  try {
    return await client.request(`/api/sdk/builds/${buildId}/preview`);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}
