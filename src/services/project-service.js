/**
 * Project Service
 * Manages project mappings and project-related operations
 *
 * This class is a thin wrapper around the functional project module.
 * It provides backwards compatibility while delegating to pure functions.
 */

import {
  createMapping,
  createProjectToken,
  getMapping,
  getProject,
  getRecentBuilds,
  listMappings,
  listProjects,
  listProjectTokens,
  removeMapping,
  revokeProjectToken,
  switchProject,
} from '../project/index.js';
import {
  deleteProjectMapping,
  getProjectMapping,
  getProjectMappings,
  saveProjectMapping,
} from '../utils/global-config.js';

/**
 * Create a mapping store adapter from global-config functions
 * @returns {Object} Mapping store with standard interface
 */
function createMappingStore() {
  return {
    getMappings: getProjectMappings,
    getMapping: getProjectMapping,
    saveMapping: saveProjectMapping,
    deleteMapping: deleteProjectMapping,
  };
}

/**
 * ProjectService for managing project mappings and operations
 */
export class ProjectService {
  constructor(config, options = {}) {
    this.config = config;
    this.apiService = options.apiService;
    this.authService = options.authService;
    this._mappingStore = createMappingStore();
  }

  /**
   * List all project mappings
   * @returns {Promise<Array>} Array of project mappings
   */
  async listMappings() {
    return listMappings(this._mappingStore);
  }

  /**
   * Get project mapping for a specific directory
   * @param {string} directory - Directory path
   * @returns {Promise<Object|null>} Project mapping or null
   */
  async getMapping(directory) {
    return getMapping(this._mappingStore, directory);
  }

  /**
   * Create or update project mapping
   * @param {string} directory - Directory path
   * @param {Object} projectData - Project data
   * @param {string} projectData.projectSlug - Project slug
   * @param {string} projectData.organizationSlug - Organization slug
   * @param {string} projectData.token - Project API token
   * @param {string} [projectData.projectName] - Optional project name
   * @returns {Promise<Object>} Created mapping
   */
  async createMapping(directory, projectData) {
    return createMapping(this._mappingStore, directory, projectData);
  }

  /**
   * Remove project mapping
   * @param {string} directory - Directory path
   * @returns {Promise<void>}
   */
  async removeMapping(directory) {
    return removeMapping(this._mappingStore, directory);
  }

  /**
   * Switch project for current directory
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @param {string} token - Project token
   * @returns {Promise<Object>} Updated mapping
   */
  async switchProject(projectSlug, organizationSlug, token) {
    let currentDir = process.cwd();
    return switchProject(
      this._mappingStore,
      currentDir,
      projectSlug,
      organizationSlug,
      token
    );
  }

  /**
   * List all projects from API
   * Uses OAuth authentication (authService) when available, falls back to API token
   * @returns {Promise<Array>} Array of projects with organization info
   */
  async listProjects() {
    return listProjects({
      oauthClient: this.authService,
      apiClient: this.apiService,
    });
  }

  /**
   * Get project details
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @returns {Promise<Object>} Project details
   */
  async getProject(projectSlug, organizationSlug) {
    return getProject({
      oauthClient: this.authService,
      apiClient: this.apiService,
      projectSlug,
      organizationSlug,
    });
  }

  /**
   * Get recent builds for a project
   * Uses OAuth authentication (authService) when available, falls back to API token
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @param {Object} options - Query options
   * @param {number} [options.limit=10] - Number of builds to fetch
   * @param {string} [options.branch] - Filter by branch
   * @returns {Promise<Array>} Array of builds
   */
  async getRecentBuilds(projectSlug, organizationSlug, options = {}) {
    return getRecentBuilds({
      oauthClient: this.authService,
      apiClient: this.apiService,
      projectSlug,
      organizationSlug,
      limit: options.limit,
      branch: options.branch,
    });
  }

  /**
   * Create a project token
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @param {Object} tokenData - Token data
   * @param {string} tokenData.name - Token name
   * @param {string} [tokenData.description] - Token description
   * @returns {Promise<Object>} Created token
   */
  async createProjectToken(projectSlug, organizationSlug, tokenData) {
    return createProjectToken(
      this.apiService,
      projectSlug,
      organizationSlug,
      tokenData
    );
  }

  /**
   * List project tokens
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @returns {Promise<Array>} Array of tokens
   */
  async listProjectTokens(projectSlug, organizationSlug) {
    return listProjectTokens(this.apiService, projectSlug, organizationSlug);
  }

  /**
   * Revoke a project token
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @param {string} tokenId - Token ID
   * @returns {Promise<void>}
   */
  async revokeProjectToken(projectSlug, organizationSlug, tokenId) {
    return revokeProjectToken(
      this.apiService,
      projectSlug,
      organizationSlug,
      tokenId
    );
  }
}
