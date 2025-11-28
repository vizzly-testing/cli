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
    this.authService = options.authService;
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
      throw new VizzlyError(
        'Organization slug is required',
        'INVALID_PROJECT_DATA'
      );
    }

    if (!projectData.token) {
      throw new VizzlyError(
        'Project token is required',
        'INVALID_PROJECT_DATA'
      );
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
   * Uses OAuth authentication (authService) when available, falls back to API token
   * @returns {Promise<Array>} Array of projects with organization info
   */
  async listProjects() {
    // Try OAuth-based request first (user login via device flow)
    if (this.authService) {
      try {
        // First get the user's organizations via whoami
        let whoami = await this.authService.authenticatedRequest(
          '/api/auth/cli/whoami',
          { method: 'GET' }
        );

        let organizations = whoami.organizations || [];
        if (organizations.length === 0) {
          return [];
        }

        // Fetch projects for each organization
        let allProjects = [];
        for (let org of organizations) {
          try {
            let response = await this.authService.authenticatedRequest(
              '/api/project',
              {
                method: 'GET',
                headers: { 'X-Organization': org.slug },
              }
            );

            // Add organization info to each project
            let projects = (response.projects || []).map(project => ({
              ...project,
              organizationSlug: org.slug,
              organizationName: org.name,
            }));

            allProjects.push(...projects);
          } catch {
            // Skip org on error, continue with others
          }
        }

        return allProjects;
      } catch {
        // Fall through to try apiService
      }
    }

    // Fall back to API token-based request (tokens are org-scoped, so no org header needed)
    if (this.apiService) {
      try {
        let response = await this.apiService.request('/api/project', {
          method: 'GET',
        });
        return response.projects || [];
      } catch {
        // Return empty array on error
        return [];
      }
    }

    // No authentication available
    return [];
  }

  /**
   * Get project details
   * @param {string} projectSlug - Project slug
   * @param {string} organizationSlug - Organization slug
   * @returns {Promise<Object>} Project details
   */
  async getProject(projectSlug, organizationSlug) {
    // Try OAuth-based request first
    if (this.authService) {
      try {
        let response = await this.authService.authenticatedRequest(
          `/api/project/${projectSlug}`,
          {
            method: 'GET',
            headers: { 'X-Organization': organizationSlug },
          }
        );
        return response.project || response;
      } catch {
        // Fall through to apiService
      }
    }

    // Fall back to API token
    if (this.apiService) {
      try {
        let response = await this.apiService.request(
          `/api/project/${projectSlug}`,
          {
            method: 'GET',
            headers: { 'X-Organization': organizationSlug },
          }
        );
        return response.project || response;
      } catch (error) {
        throw new VizzlyError(
          `Failed to fetch project: ${error.message}`,
          'PROJECT_FETCH_FAILED',
          { originalError: error }
        );
      }
    }

    throw new VizzlyError('No authentication available', 'NO_AUTH_SERVICE');
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
    let queryParams = new globalThis.URLSearchParams();
    if (options.limit) queryParams.append('limit', String(options.limit));
    if (options.branch) queryParams.append('branch', options.branch);

    let query = queryParams.toString();
    let url = `/api/build/${projectSlug}${query ? `?${query}` : ''}`;

    // Try OAuth-based request first (user login via device flow)
    if (this.authService) {
      try {
        let response = await this.authService.authenticatedRequest(url, {
          method: 'GET',
          headers: { 'X-Organization': organizationSlug },
        });
        return response.builds || [];
      } catch {
        // Fall through to try apiService
      }
    }

    // Fall back to API token-based request
    if (this.apiService) {
      try {
        let response = await this.apiService.request(url, {
          method: 'GET',
          headers: { 'X-Organization': organizationSlug },
        });
        return response.builds || [];
      } catch {
        // Return empty array on error
        return [];
      }
    }

    // No authentication available
    return [];
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
