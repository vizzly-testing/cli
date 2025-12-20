/**
 * Project Service
 * Wraps project operations for use by the HTTP server
 *
 * Provides the interface expected by src/server/routers/projects.js:
 * - listProjects() - Returns [] if not authenticated
 * - listMappings() - Returns [] if no mappings
 * - getMapping(directory) - Returns null if not found
 * - createMapping(directory, projectData) - Throws on invalid input
 * - removeMapping(directory) - Throws on invalid directory
 * - getRecentBuilds(projectSlug, organizationSlug, options) - Returns [] if not authenticated
 *
 * Error handling:
 * - API methods (listProjects, getRecentBuilds) return empty arrays when not authenticated
 * - Local methods (listMappings, getMapping) never require authentication
 * - Validation errors (createMapping, removeMapping) throw with descriptive messages
 */

import { createAuthClient } from '../auth/client.js';
import * as projectOps from '../project/operations.js';
import { getApiUrl } from '../utils/environment-config.js';
import {
  deleteProjectMapping,
  getAuthTokens,
  getProjectMapping,
  getProjectMappings,
  saveProjectMapping,
} from '../utils/global-config.js';

/**
 * Create a project service instance
 * @param {Object} [options]
 * @param {string} [options.apiUrl] - API base URL (defaults to VIZZLY_API_URL or https://app.vizzly.dev)
 * @param {Object} [options.httpClient] - Injectable HTTP client (for testing)
 * @param {Object} [options.mappingStore] - Injectable mapping store (for testing)
 * @param {Function} [options.getAuthTokens] - Injectable token getter (for testing)
 * @returns {Object} Project service
 */
export function createProjectService(options = {}) {
  let apiUrl = options.apiUrl || getApiUrl();

  // Create HTTP client once at service creation (not per-request)
  // Allow injection for testing
  let httpClient = options.httpClient || createAuthClient({ baseUrl: apiUrl });

  // Create mapping store adapter for global config
  // Allow injection for testing
  let mappingStore = options.mappingStore || {
    getMappings: getProjectMappings,
    getMapping: getProjectMapping,
    saveMapping: saveProjectMapping,
    deleteMapping: deleteProjectMapping,
  };

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
     * List all project mappings
     * @returns {Promise<Array>} Array of project mappings
     */
    async listMappings() {
      return projectOps.listMappings(mappingStore);
    },

    /**
     * Get project mapping for a specific directory
     * @param {string} directory - Directory path
     * @returns {Promise<Object|null>} Project mapping or null
     */
    async getMapping(directory) {
      return projectOps.getMapping(mappingStore, directory);
    },

    /**
     * Create or update project mapping
     * @param {string} directory - Directory path
     * @param {Object} projectData - Project data
     * @returns {Promise<Object>} Created mapping
     */
    async createMapping(directory, projectData) {
      return projectOps.createMapping(mappingStore, directory, projectData);
    },

    /**
     * Remove project mapping
     * @param {string} directory - Directory path
     * @returns {Promise<void>}
     */
    async removeMapping(directory) {
      return projectOps.removeMapping(mappingStore, directory);
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
