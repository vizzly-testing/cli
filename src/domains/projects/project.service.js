import { createAuthClient } from '../auth/auth-client.js';
import { getAuthTokens } from '../auth/token-store.js';
import { getApiUrl } from '../config/environment.js';
import {
  enrichProjectsWithOrg,
  extractBuilds,
  extractOrganizations,
  extractProject,
  extractProjects,
  extractToken,
  extractTokens,
} from './project.normalizers.js';
import {
  buildNoApiServiceError,
  buildNoAuthError,
  buildProjectFetchError,
  buildTokenCreateError,
  buildTokenRevokeError,
  buildTokensFetchError,
} from './project-errors.js';
import {
  buildBuildsUrl,
  buildOrgHeader,
  buildProjectUrl,
  buildTokensUrl,
} from './project-requests.js';

/**
 * Project Operations - Project operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - httpClient: for making API requests (OAuth or API token based)
 *
 * This makes them trivially testable without mocking modules.
 */

/**
 * Project Service
 * Wraps project operations for use by the HTTP server
 *
 * Provides the interface expected by src/domains/projects/projects.routes.js:
 * - listProjects() - Returns [] if not authenticated
 * - getRecentBuilds(projectSlug, organizationSlug, options) - Returns [] if not authenticated
 *
 * Error handling:
 * - API methods (listProjects, getRecentBuilds) return empty arrays when not authenticated
 */

/**
 * Create a project service instance
 * @param {Object} [options]
 * @param {string} [options.apiUrl] - API base URL (defaults to VIZZLY_API_URL or https://app.vizzly.dev)
 * @param {Object} [options.httpClient] - Injectable HTTP client (for testing)
 * @param {Function} [options.getAuthTokens] - Injectable token getter (for testing)
 * @returns {Object} Project service
 */
export function createProjectService(options = {}) {
  let apiUrl = options.apiUrl || getApiUrl();

  // Create HTTP client once at service creation (not per-request)
  // Allow injection for testing
  let httpClient = options.httpClient || createAuthClient({ baseUrl: apiUrl });

  // Allow injection of getAuthTokens for testing
  let tokenGetter = options.getAuthTokens || getAuthTokens;

  /**
   * Create an OAuth client with current access token
   * @returns {Promise<Object|null>} OAuth client or null if not authenticated
   */
  async function createOAuthClient() {
    let auth = await tokenGetter();
    if (!auth?.accessToken) {
      return null;
    }

    // Wrap authenticatedRequest to auto-inject the access token
    return {
      authenticatedRequest: (endpoint, fetchOptions = {}) =>
        httpClient.authenticatedRequest(
          endpoint,
          auth.accessToken,
          fetchOptions
        ),
    };
  }

  return {
    /**
     * List all projects from API
     * Returns empty array if not authenticated (projectOps handles null oauthClient)
     * @returns {Promise<Array>} Array of projects, empty if not authenticated
     */
    async listProjects() {
      let oauthClient = await createOAuthClient();
      // listProjects handles null oauthClient by returning []
      return listProjects({ oauthClient, apiClient: null });
    },

    /**
     * Get recent builds for a project
     * Returns empty array if not authenticated (projectOps handles null oauthClient)
     * @param {string} projectSlug - Project slug
     * @param {string} organizationSlug - Organization slug
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of builds, empty if not authenticated
     */
    async getRecentBuilds(projectSlug, organizationSlug, options = {}) {
      let oauthClient = await createOAuthClient();
      // getRecentBuilds handles null oauthClient by returning []
      return getRecentBuilds({
        oauthClient,
        apiClient: null,
        projectSlug,
        organizationSlug,
        limit: options.limit,
        branch: options.branch,
      });
    },
  };
}

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
        headers: {
          'Content-Type': 'application/json',
          ...buildOrgHeader(organizationSlug),
        },
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
        headers: buildOrgHeader(organizationSlug),
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
        headers: buildOrgHeader(organizationSlug),
      }
    );
  } catch (error) {
    throw buildTokenRevokeError(error);
  }
}
