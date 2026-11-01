import {
  buildEndpointWithParams,
  buildQueryParams,
} from '../../services/cloud-protocol.js';
import { buildBuildPayload } from './build.serializers.js';

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
 * Get the server-owned build processing and review status.
 *
 * This endpoint keeps processing, comparison, and review counts separate so
 * callers do not have to reconstruct lifecycle state from legacy build fields.
 *
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @returns {Promise<Object>} Build status response
 */
export async function getBuildStatus(client, buildId) {
  return client.request(`/api/sdk/builds/${buildId}/status`);
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
 * @param {number|null} [executionTimeMs=null] - Execution time in milliseconds
 * @param {string} [failureReason] - Explanation sent only for a failed build
 * @returns {Promise<Object>} Updated build data
 */
export async function updateBuildStatus(
  client,
  buildId,
  status,
  executionTimeMs = null,
  failureReason
) {
  let body = { status };
  if (status === 'failed' && failureReason) body.failureReason = failureReason;
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
 * Mark a build completed or failed, with an optional failure explanation.
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {boolean} [success=true] - Whether tests and uploads succeeded
 * @param {number|null} [executionTimeMs=null] - Execution time in milliseconds
 * @param {string} [failureReason] - Explanation sent only for a failed build
 * @returns {Promise<Object>} Finalized build data
 */
export async function finalizeBuild(
  client,
  buildId,
  success = true,
  executionTimeMs = null,
  failureReason
) {
  let status = success ? 'completed' : 'failed';
  return updateBuildStatus(
    client,
    buildId,
    status,
    executionTimeMs,
    failureReason
  );
}

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
