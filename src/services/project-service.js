/**
 * Project Service
 * Manages project mappings and project-related operations
 */

import { BaseService } from './base-service.js';
import { VizzlyError } from '../errors/vizzly-error.js';
import {
  getProjectMappings,
  saveProjectMapping,
  deleteProjectMapping,
  getProjectMapping,
} from '../utils/global-config.js';

/**
 * ProjectService for managing project mappings and operations
 * @extends BaseService
 */
export class ProjectService extends BaseService {
  constructor(config, options = {}) {
    super(config, options);
    this.apiService = options.apiService;
  }

  /**
   * List all project mappings
   * @returns {Promise<Array>} Array of project mappings
   */
  async listMappings() {
    let mappings = await getProjectMappings();

    // Convert object to array with directory path included
    return Object.entries(mappings).map(([directory, data]) => ({
      directory,
      ...data,
    }));
  }

  /**
   * Get project mapping for a specific directory
   * @param {string} directory - Directory path
   * @returns {Promise<Object|null>} Project mapping or null
   */
  async getMapping(directory) {
    return getProjectMapping(directory);
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
    if (!directory) {
      throw new VizzlyError('Directory path is required', 'INVALID_DIRECTORY');
    }

    if (!projectData.projectSlug) {
      throw new VizzlyError('Project slug is required', 'INVALID_PROJECT_DATA');
    }

    if (!projectData.organizationSlug) {
      throw new VizzlyError('Organization slug is required', 'INVALID_PROJECT_DATA');
    }

    if (!projectData.token) {
      throw new VizzlyError('Project token is required', 'INVALID_PROJECT_DATA');
    }

    await saveProjectMapping(directory, projectData);

    return {
      directory,
      ...projectData,
    };
  }

  /**
   * Remove project mapping
   * @param {string} directory - Directory path
   * @returns {Promise<void>}
   */
  async removeMapping(directory) {
    if (!directory) {
      throw new VizzlyError('Directory path is required', 'INVALID_DIRECTORY');
    }

    await deleteProjectMapping(directory);
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

    return this.createMapping(currentDir, {
      projectSlug,
      organizationSlug,
      token,
    });
  }

  /**
   * List all projects from API
   * @returns {Promise<Array>} Array of projects
   */
  async listProjects() {
    if (!this.apiService) {
      // Return empty array if not authenticated - this is expected in local mode
      return [];
    }

    try {
      let response = await this.apiService.request('/api/cli/projects', {
        method: 'GET',
      });

      return response.projects || [];
    } catch (error) {
      // Return empty array on error - likely not authenticated
      return [];
    }
  }

  /**
   * Get project details
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @returns {Promise<Object>} Project details
   */
  async getProject(projectSlug, organizationSlug) {
    if (!this.apiService) {
      throw new VizzlyError('API service not available', 'NO_API_SERVICE');
    }

    try {
      let response = await this.apiService.request(
        `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}`,
        {
          method: 'GET',
        }
      );

      return response.project;
    } catch (error) {
      throw new VizzlyError(
        `Failed to fetch project: ${error.message}`,
        'PROJECT_FETCH_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Get recent builds for a project
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @param {Object} options - Query options
   * @param {number} [options.limit=10] - Number of builds to fetch
   * @param {string} [options.branch] - Filter by branch
   * @returns {Promise<Array>} Array of builds
   */
  async getRecentBuilds(projectSlug, organizationSlug, options = {}) {
    if (!this.apiService) {
      // Return empty array if not authenticated
      return [];
    }

    let queryParams = new URLSearchParams();
    if (options.limit) queryParams.append('limit', String(options.limit));
    if (options.branch) queryParams.append('branch', options.branch);

    let query = queryParams.toString();
    let url = `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}/builds${query ? `?${query}` : ''}`;

    try {
      let response = await this.apiService.request(url, {
        method: 'GET',
      });

      return response.builds || [];
    } catch (error) {
      // Return empty array on error
      return [];
    }
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
    if (!this.apiService) {
      throw new VizzlyError('API service not available', 'NO_API_SERVICE');
    }

    try {
      let response = await this.apiService.request(
        `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}/tokens`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokenData),
        }
      );

      return response.token;
    } catch (error) {
      throw new VizzlyError(
        `Failed to create project token: ${error.message}`,
        'TOKEN_CREATE_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * List project tokens
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @returns {Promise<Array>} Array of tokens
   */
  async listProjectTokens(projectSlug, organizationSlug) {
    if (!this.apiService) {
      throw new VizzlyError('API service not available', 'NO_API_SERVICE');
    }

    try {
      let response = await this.apiService.request(
        `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}/tokens`,
        {
          method: 'GET',
        }
      );

      return response.tokens || [];
    } catch (error) {
      throw new VizzlyError(
        `Failed to fetch project tokens: ${error.message}`,
        'TOKENS_FETCH_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Revoke a project token
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @param {string} tokenId - Token ID
   * @returns {Promise<void>}
   */
  async revokeProjectToken(projectSlug, organizationSlug, tokenId) {
    if (!this.apiService) {
      throw new VizzlyError('API service not available', 'NO_API_SERVICE');
    }

    try {
      await this.apiService.request(
        `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}/tokens/${tokenId}`,
        {
          method: 'DELETE',
        }
      );
    } catch (error) {
      throw new VizzlyError(
        `Failed to revoke project token: ${error.message}`,
        'TOKEN_REVOKE_FAILED',
        { originalError: error }
      );
    }
  }
}
