/**
 * Project Service
 * Wraps project operations for use by the HTTP server
 *
 * Provides the interface expected by src/server/routers/projects.js:
 * - listProjects()
 * - listMappings()
 * - getMapping(directory)
 * - createMapping(directory, projectData)
 * - removeMapping(directory)
 * - getRecentBuilds(projectSlug, organizationSlug, options)
 */

import { createAuthClient } from '../auth/client.js';
import * as projectOps from '../project/operations.js';
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
 * @returns {Object} Project service
 */
export function createProjectService(options = {}) {
  let apiUrl =
    options.apiUrl || process.env.VIZZLY_API_URL || 'https://app.vizzly.dev';

  // Create mapping store adapter for global config
  let mappingStore = {
    getMappings: getProjectMappings,
    getMapping: getProjectMapping,
    saveMapping: saveProjectMapping,
    deleteMapping: deleteProjectMapping,
  };

  /**
   * Create an OAuth client with current access token
   * @returns {Promise<Object|null>} OAuth client or null if not authenticated
   */
  async function createOAuthClient() {
    let auth = await getAuthTokens();
    if (!auth?.accessToken) {
      return null;
    }

    let httpClient = createAuthClient({ baseUrl: apiUrl });

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
     * @returns {Promise<Array>} Array of projects
     */
    async listProjects() {
      let oauthClient = await createOAuthClient();
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
     * @param {string} projectSlug - Project slug
     * @param {string} organizationSlug - Organization slug
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of builds
     */
    async getRecentBuilds(projectSlug, organizationSlug, options = {}) {
      let oauthClient = await createOAuthClient();
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
