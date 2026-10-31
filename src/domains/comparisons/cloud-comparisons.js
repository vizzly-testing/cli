import { VizzlyError } from '../../errors/vizzly-error.js';
import { buildEndpointWithParams } from '../../services/cloud-protocol.js';

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
 * @param {Object} filters - Optional filters (branch, project, organization, limit, offset)
 * @returns {Promise<Object>} Search results with comparisons and pagination
 */
export async function searchComparisons(client, name, filters = {}) {
  if (!name || typeof name !== 'string') {
    throw new VizzlyError('name is required and must be a non-empty string');
  }

  let { branch, project, organization, limit = 50, offset = 0 } = filters;
  let params = { name, limit: String(limit), offset: String(offset) };
  if (branch) params.branch = branch;
  if (project) params.project = project;
  if (organization) params.organization = organization;

  let endpoint = buildEndpointWithParams('/api/sdk/comparisons/search', params);
  return client.request(endpoint);
}
