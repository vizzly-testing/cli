/**
 * Project Operations - Project operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - mappingStore: for reading/writing project mappings
 * - httpClient: for making API requests (OAuth or API token based)
 *
 * This makes them trivially testable without mocking modules.
 */

import {
  buildBuildsUrl,
  buildMappingResult,
  buildNoApiServiceError,
  buildNoAuthError,
  buildOrgHeader,
  buildProjectFetchError,
  buildProjectUrl,
  buildTokenCreateError,
  buildTokenRevokeError,
  buildTokensFetchError,
  buildTokensUrl,
  enrichProjectsWithOrg,
  extractBuilds,
  extractOrganizations,
  extractProject,
  extractProjects,
  extractToken,
  extractTokens,
  mappingsToArray,
  validateDirectory,
  validateProjectData,
} from './core.js';

// ============================================================================
// Mapping Operations
// ============================================================================

/**
 * List all project mappings
 * @param {Object} mappingStore - Store with getMappings method
 * @returns {Promise<Array>} Array of project mappings with directory included
 */
export async function listMappings(mappingStore) {
  let mappings = await mappingStore.getMappings();
  return mappingsToArray(mappings);
}

/**
 * Get project mapping for a specific directory
 * @param {Object} mappingStore - Store with getMapping method
 * @param {string} directory - Directory path
 * @returns {Promise<Object|null>} Project mapping or null
 */
export async function getMapping(mappingStore, directory) {
  return mappingStore.getMapping(directory);
}

/**
 * Create or update project mapping
 * @param {Object} mappingStore - Store with saveMapping method
 * @param {string} directory - Directory path
 * @param {Object} projectData - Project data
 * @returns {Promise<Object>} Created mapping with directory included
 */
export async function createMapping(mappingStore, directory, projectData) {
  let dirValidation = validateDirectory(directory);
  if (!dirValidation.valid) {
    throw dirValidation.error;
  }

  let dataValidation = validateProjectData(projectData);
  if (!dataValidation.valid) {
    throw dataValidation.error;
  }

  await mappingStore.saveMapping(directory, projectData);
  return buildMappingResult(directory, projectData);
}

/**
 * Remove project mapping
 * @param {Object} mappingStore - Store with deleteMapping method
 * @param {string} directory - Directory path
 * @returns {Promise<void>}
 */
export async function removeMapping(mappingStore, directory) {
  let validation = validateDirectory(directory);
  if (!validation.valid) {
    throw validation.error;
  }

  await mappingStore.deleteMapping(directory);
}

/**
 * Switch project for a directory (convenience wrapper for createMapping)
 * @param {Object} mappingStore - Store with saveMapping method
 * @param {string} directory - Directory path
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @param {string} token - Project token
 * @returns {Promise<Object>} Updated mapping
 */
export async function switchProject(
  mappingStore,
  directory,
  projectSlug,
  organizationSlug,
  token
) {
  return createMapping(mappingStore, directory, {
    projectSlug,
    organizationSlug,
    token,
  });
}

// ============================================================================
// API Operations - List Projects
// ============================================================================

/**
 * List all projects from API using OAuth authentication
 * @param {Object} oauthClient - OAuth HTTP client with authenticatedRequest method
 * @returns {Promise<Array>} Array of projects with organization info
 */
export async function listProjectsWithOAuth(oauthClient) {
  // First get the user's organizations via whoami
  let whoami = await oauthClient.authenticatedRequest('/api/auth/cli/whoami', {
    method: 'GET',
  });

  let organizations = extractOrganizations(whoami);
  if (organizations.length === 0) {
    return [];
  }

  // Fetch projects for each organization
  let allProjects = [];

  for (let org of organizations) {
    try {
      let response = await oauthClient.authenticatedRequest('/api/project', {
        method: 'GET',
        headers: buildOrgHeader(org.slug),
      });

      let projects = extractProjects(response);
      let enriched = enrichProjectsWithOrg(projects, org);
      allProjects.push(...enriched);
    } catch {
      // Silently skip failed orgs
    }
  }

  return allProjects;
}

/**
 * List all projects from API using API token authentication
 * @param {Object} apiClient - API HTTP client with request method
 * @returns {Promise<Array>} Array of projects
 */
export async function listProjectsWithApiToken(apiClient) {
  let response = await apiClient.request('/api/project', {
    method: 'GET',
  });
  return extractProjects(response);
}

/**
 * List all projects, trying OAuth first then falling back to API token
 * @param {Object} options - Options
 * @param {Object} [options.oauthClient] - OAuth HTTP client
 * @param {Object} [options.apiClient] - API token HTTP client
 * @returns {Promise<Array>} Array of projects
 */
export async function listProjects({ oauthClient, apiClient }) {
  // Try OAuth-based request first
  if (oauthClient) {
    try {
      return await listProjectsWithOAuth(oauthClient);
    } catch {
      // Fall back to API token
    }
  }

  // Fall back to API token-based request
  if (apiClient) {
    try {
      return await listProjectsWithApiToken(apiClient);
    } catch {
      return [];
    }
  }

  // No authentication available
  return [];
}

// ============================================================================
// API Operations - Get Project
// ============================================================================

/**
 * Get project details using OAuth authentication
 * @param {Object} oauthClient - OAuth HTTP client
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @returns {Promise<Object>} Project details
 */
export async function getProjectWithOAuth(
  oauthClient,
  projectSlug,
  organizationSlug
) {
  let response = await oauthClient.authenticatedRequest(
    buildProjectUrl(projectSlug),
    {
      method: 'GET',
      headers: buildOrgHeader(organizationSlug),
    }
  );
  return extractProject(response);
}

/**
 * Get project details using API token authentication
 * @param {Object} apiClient - API HTTP client
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @returns {Promise<Object>} Project details
 */
export async function getProjectWithApiToken(
  apiClient,
  projectSlug,
  organizationSlug
) {
  let response = await apiClient.request(buildProjectUrl(projectSlug), {
    method: 'GET',
    headers: buildOrgHeader(organizationSlug),
  });
  return extractProject(response);
}

/**
 * Get project details, trying OAuth first then falling back to API token
 * @param {Object} options - Options
 * @param {Object} [options.oauthClient] - OAuth HTTP client
 * @param {Object} [options.apiClient] - API token HTTP client
 * @param {string} options.projectSlug - Project slug
 * @param {string} options.organizationSlug - Organization slug
 * @returns {Promise<Object>} Project details
 */
export async function getProject({
  oauthClient,
  apiClient,
  projectSlug,
  organizationSlug,
}) {
  // Try OAuth-based request first
  if (oauthClient) {
    try {
      return await getProjectWithOAuth(
        oauthClient,
        projectSlug,
        organizationSlug
      );
    } catch {
      // Fall back to API token
    }
  }

  // Fall back to API token
  if (apiClient) {
    try {
      return await getProjectWithApiToken(
        apiClient,
        projectSlug,
        organizationSlug
      );
    } catch (error) {
      throw buildProjectFetchError(error);
    }
  }

  throw buildNoAuthError();
}

// ============================================================================
// API Operations - Recent Builds
// ============================================================================

/**
 * Get recent builds for a project using OAuth authentication
 * @param {Object} oauthClient - OAuth HTTP client
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of builds
 */
export async function getRecentBuildsWithOAuth(
  oauthClient,
  projectSlug,
  organizationSlug,
  options = {}
) {
  let response = await oauthClient.authenticatedRequest(
    buildBuildsUrl(projectSlug, options),
    {
      method: 'GET',
      headers: buildOrgHeader(organizationSlug),
    }
  );
  return extractBuilds(response);
}

/**
 * Get recent builds for a project using API token authentication
 * @param {Object} apiClient - API HTTP client
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of builds
 */
export async function getRecentBuildsWithApiToken(
  apiClient,
  projectSlug,
  organizationSlug,
  options = {}
) {
  let response = await apiClient.request(buildBuildsUrl(projectSlug, options), {
    method: 'GET',
    headers: buildOrgHeader(organizationSlug),
  });
  return extractBuilds(response);
}

/**
 * Get recent builds for a project, trying OAuth first then falling back to API token
 * @param {Object} options - Options
 * @param {Object} [options.oauthClient] - OAuth HTTP client
 * @param {Object} [options.apiClient] - API token HTTP client
 * @param {string} options.projectSlug - Project slug
 * @param {string} options.organizationSlug - Organization slug
 * @param {number} [options.limit] - Number of builds to fetch
 * @param {string} [options.branch] - Filter by branch
 * @returns {Promise<Array>} Array of builds
 */
export async function getRecentBuilds({
  oauthClient,
  apiClient,
  projectSlug,
  organizationSlug,
  limit,
  branch,
}) {
  let queryOptions = { limit, branch };

  // Try OAuth-based request first
  if (oauthClient) {
    try {
      return await getRecentBuildsWithOAuth(
        oauthClient,
        projectSlug,
        organizationSlug,
        queryOptions
      );
    } catch {
      // Fall back to API token
    }
  }

  // Fall back to API token-based request
  if (apiClient) {
    try {
      return await getRecentBuildsWithApiToken(
        apiClient,
        projectSlug,
        organizationSlug,
        queryOptions
      );
    } catch {
      return [];
    }
  }

  // No authentication available
  return [];
}

// ============================================================================
// API Operations - Project Tokens
// ============================================================================

/**
 * Create a project token
 * @param {Object} apiClient - API HTTP client with request method
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @param {Object} tokenData - Token data
 * @param {string} tokenData.name - Token name
 * @param {string} [tokenData.description] - Token description
 * @returns {Promise<Object>} Created token
 */
export async function createProjectToken(
  apiClient,
  projectSlug,
  organizationSlug,
  tokenData
) {
  if (!apiClient) {
    throw buildNoApiServiceError();
  }

  try {
    let response = await apiClient.request(
      buildTokensUrl(organizationSlug, projectSlug),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenData),
      }
    );
    return extractToken(response);
  } catch (error) {
    throw buildTokenCreateError(error);
  }
}

/**
 * List project tokens
 * @param {Object} apiClient - API HTTP client with request method
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @returns {Promise<Array>} Array of tokens
 */
export async function listProjectTokens(
  apiClient,
  projectSlug,
  organizationSlug
) {
  if (!apiClient) {
    throw buildNoApiServiceError();
  }

  try {
    let response = await apiClient.request(
      buildTokensUrl(organizationSlug, projectSlug),
      {
        method: 'GET',
      }
    );
    return extractTokens(response);
  } catch (error) {
    throw buildTokensFetchError(error);
  }
}

/**
 * Revoke a project token
 * @param {Object} apiClient - API HTTP client with request method
 * @param {string} projectSlug - Project slug
 * @param {string} organizationSlug - Organization slug
 * @param {string} tokenId - Token ID to revoke
 * @returns {Promise<void>}
 */
export async function revokeProjectToken(
  apiClient,
  projectSlug,
  organizationSlug,
  tokenId
) {
  if (!apiClient) {
    throw buildNoApiServiceError();
  }

  try {
    await apiClient.request(
      buildTokensUrl(organizationSlug, projectSlug, tokenId),
      {
        method: 'DELETE',
      }
    );
  } catch (error) {
    throw buildTokenRevokeError(error);
  }
}
