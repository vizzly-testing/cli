/**
 * Project Service
 * Wraps project operations for use by the HTTP server
 *
 * Provides the interface expected by src/server/routers/projects.js:
 * - listProjects() - Returns [] if not authenticated
 * - getRecentBuilds(projectSlug, organizationSlug, options) - Returns [] if not authenticated
 *
 * Error handling:
 * - API methods (listProjects, getRecentBuilds) return empty arrays when not authenticated
 */

import { createAuthClient } from '../auth/client.js';
import * as projectOps from '../project/operations.js';
import { getApiUrl } from '../utils/environment-config.js';
import { getAuthTokens } from '../utils/global-config.js';

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
      // projectOps.listProjects handles null oauthClient by returning []
      return projectOps.listProjects({ oauthClient, apiClient: null });
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
      // projectOps.getRecentBuilds handles null oauthClient by returning []
      return projectOps.getRecentBuilds({
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
