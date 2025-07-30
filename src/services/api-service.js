/**
 * API Service for Vizzly
 * Handles HTTP requests to the Vizzly API
 */

import {
  createServiceContext,
  withErrorHandling,
  withLogging,
} from './service-utils.js';
import { createLogger } from '../utils/logger.js';
import { URLSearchParams } from 'url';
import { VizzlyError } from '../errors/vizzly-error.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let packageJson;
try {
  packageJson = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf-8')
  );
} catch {
  // Fallback for tests or when package.json is not accessible
  packageJson = { name: '@vizzly-testing/cli', version: '0.1.1' };
}

/**
 * Create API service
 * @param {Object} apiOptions - API configuration
 * @param {Object} options - Service options
 * @returns {Object} API service with methods
 */
export function createApiService(apiOptions = {}, options = {}) {
  const logger =
    options.logger ||
    createLogger({
      verbose: options.verbose || false,
      level: options.logLevel || 'info',
    });

  const context = createServiceContext(apiOptions, options);

  const {
    baseUrl = process.env.VIZZLY_BASE_URL || 'https://vizzly.dev',
    apiKey = process.env.VIZZLY_API_KEY,
    timeout = 10000,
  } = apiOptions;

  /**
   * Make HTTP request
   * @param {string} endpoint - API endpoint
   * @param {Object} requestOptions - Request options
   * @returns {Promise<Object>} Response data
   */
  const makeRequest = withLogging(
    withErrorHandling(async (endpoint, requestOptions = {}) => {
      const url = `${baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'vizzly-cli',
        ...requestOptions.headers,
      };

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const fetchOptions = {
        method: requestOptions.method || 'GET',
        headers,
        timeout,
        ...requestOptions,
      };

      if (requestOptions.body) {
        fetchOptions.body =
          typeof requestOptions.body === 'string'
            ? requestOptions.body
            : JSON.stringify(requestOptions.body);
      }

      try {
        // Use dynamic import for fetch in Node.js environments
        const fetch = globalThis.fetch;
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        context.emitError(error, { endpoint, method: requestOptions.method });
        throw error;
      }
    }),
    logger,
    'makeRequest'
  );

  /**
   * Get API status
   * @returns {Promise<Object>} API status
   */
  const getStatus = withLogging(
    withErrorHandling(async () => {
      try {
        const response = await makeRequest('/health');
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          ...response,
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }),
    logger,
    'getStatus'
  );

  /**
   * Get project information
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Project data
   */
  const getProject = withLogging(
    withErrorHandling(async projectId => {
      return await makeRequest(`/projects/${projectId}`);
    }),
    logger,
    'getProject'
  );

  /**
   * Get build information
   * @param {string} buildId - Build ID
   * @param {string} include - Optional include parameter (e.g., 'screenshots')
   * @returns {Promise<Object>} Build data
   */
  const getBuild = withLogging(
    withErrorHandling(async (buildId, include = null) => {
      const endpoint = include
        ? `/builds/${buildId}?include=${include}`
        : `/builds/${buildId}`;
      return await makeRequest(endpoint);
    }),
    logger,
    'getBuild'
  );

  /**
   * Get comparison information
   * @param {string} comparisonId - Comparison ID
   * @returns {Promise<Object>} Comparison data
   */
  const getComparison = withLogging(
    withErrorHandling(async comparisonId => {
      return await makeRequest(`/comparisons/${comparisonId}`);
    }),
    logger,
    'getComparison'
  );

  /**
   * Create a new build
   * @param {Object} buildData - Build data
   * @returns {Promise<Object>} Created build
   */
  const createBuild = withLogging(
    withErrorHandling(async buildData => {
      return await makeRequest('/api/sdk/builds', {
        method: 'POST',
        body: buildData,
      });
    }),
    logger,
    'createBuild'
  );

  /**
   * Upload screenshot
   * @param {string} buildId - Build ID
   * @param {Object} screenshotData - Screenshot data
   * @returns {Promise<Object>} Upload result
   */
  const uploadScreenshot = withLogging(
    withErrorHandling(async (buildId, screenshotData) => {
      return await makeRequest(`/api/sdk/builds/${buildId}/screenshots`, {
        method: 'POST',
        body: screenshotData,
      });
    }),
    logger,
    'uploadScreenshot'
  );

  /**
   * Get builds for a project
   * @param {string|Object} projectIdOrFilters - Project ID or filter options (when projectId is in filters)
   * @param {Object} filters - Filter options (optional if first param contains filters)
   * @returns {Promise<Array>} List of builds
   */
  const getBuilds = withLogging(
    withErrorHandling(async (projectIdOrFilters, filters = {}) => {
      let endpoint;
      let queryParams;

      // Handle two call patterns:
      // 1. getBuilds(projectId, filters) - traditional API call
      // 2. getBuilds(filters) - for TDD service where filters contain all info
      if (typeof projectIdOrFilters === 'string') {
        // Traditional call: getBuilds(projectId, filters)
        queryParams = new URLSearchParams(filters).toString();
        endpoint = `/projects/${projectIdOrFilters}/builds${queryParams ? `?${queryParams}` : ''}`;
      } else {
        // TDD call: getBuilds(filters) where filters might contain projectId
        const allFilters = projectIdOrFilters || {};
        queryParams = new URLSearchParams(allFilters).toString();
        endpoint = `/builds${queryParams ? `?${queryParams}` : ''}`;
      }

      const response = await makeRequest(endpoint);
      return response.builds || response.data || [];
    }),
    logger,
    'getBuilds'
  );

  /**
   * Get build status information
   * @param {string} buildId - Build ID
   * @returns {Promise<Object>} Build status data
   */
  const getBuildStatus = withLogging(
    withErrorHandling(async buildId => {
      return await getBuild(buildId, 'screenshots,comparisons');
    }),
    logger,
    'getBuildStatus'
  );

  /**
   * Validate API token
   * @returns {Promise<Object>} Token validation result
   */
  const validateToken = withLogging(
    withErrorHandling(async () => {
      return await makeRequest('/auth/validate');
    }),
    logger,
    'validateToken'
  );

  /**
   * Test API connectivity
   * @returns {Promise<Object>} Connection test result
   */
  const testConnection = withLogging(
    withErrorHandling(async () => {
      const start = Date.now();

      try {
        await makeRequest('/ping');
        const duration = Date.now() - start;

        return {
          success: true,
          duration,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const duration = Date.now() - start;

        return {
          success: false,
          error: error.message,
          duration,
          timestamp: new Date().toISOString(),
        };
      }
    }),
    logger,
    'testConnection'
  );

  /**
   * Cleanup resources
   */
  const cleanup = async () => {
    await context.cleanup.execute();
  };

  return {
    // Core methods
    makeRequest,
    getStatus,
    testConnection,
    validateToken,

    // Resource methods
    getProject,
    getBuild,
    getBuildStatus,
    getComparison,
    createBuild,
    getBuilds,
    uploadScreenshot,

    // Utility methods
    cleanup,

    // Configuration getters
    get baseUrl() {
      return baseUrl;
    },
    get hasApiKey() {
      return !!apiKey;
    },

    // Event methods
    on: context.on,
    off: context.off,
    once: context.once,
  };
}

/**
 * ApiService class for direct API communication
 */
export class ApiService {
  constructor(options = {}) {
    this.baseUrl =
      options.baseUrl || process.env.VIZZLY_API_URL || 'https://vizzly.dev';
    this.token = options.token || process.env.VIZZLY_TOKEN;

    // Build User-Agent string
    const command = options.command || 'run'; // Default to 'run' for API service
    const baseUserAgent = `vizzly-cli/${packageJson.version} (${command})`;
    const sdkUserAgent = options.userAgent || process.env.VIZZLY_USER_AGENT;
    this.userAgent = sdkUserAgent
      ? `${baseUserAgent} ${sdkUserAgent}`
      : baseUserAgent;

    if (!this.token) {
      throw new VizzlyError(
        'No API token provided. Set VIZZLY_TOKEN environment variable.'
      );
    }
  }

  /**
   * Make an API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'User-Agent': this.userAgent,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new VizzlyError(
        `API request failed: ${response.status} - ${error} (URL: ${url})`
      );
    }

    return response.json();
  }

  /**
   * Create a new build
   * @param {Object} metadata - Build metadata
   * @returns {Promise<Object>} Created build data
   */
  async createBuild(metadata) {
    return this.request('/api/sdk/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
  }

  /**
   * Check if SHAs already exist on the server
   * @param {string[]} shas - Array of SHA256 hashes to check
   * @returns {Promise<string[]>} Array of existing SHAs
   */
  async checkShas(shas) {
    try {
      const response = await this.request('/api/sdk/check-shas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shas }),
      });
      return response.existing || [];
    } catch (error) {
      // Continue without deduplication on error
      console.debug(
        'SHA check failed, continuing without deduplication:',
        error.message
      );
      return [];
    }
  }

  /**
   * Upload a screenshot with SHA checking
   * @param {string} buildId - Build ID
   * @param {string} name - Screenshot name
   * @param {Buffer} buffer - Screenshot data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadScreenshot(buildId, name, buffer, metadata = {}) {
    // Calculate SHA256 of the image
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check if this SHA already exists
    const existingShas = await this.checkShas([sha256]);

    if (existingShas.includes(sha256)) {
      // File already exists, skip upload but still register the screenshot
      return {
        message: 'Screenshot already exists, skipped upload',
        sha256,
        skipped: true,
      };
    }

    // File doesn't exist, proceed with upload
    return this.request(`/api/sdk/builds/${buildId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        image_data: buffer.toString('base64'),
        properties: metadata.properties || {},
        sha256, // Include SHA for server-side deduplication
      }),
    });
  }

  /**
   * Update build status
   * @param {string} buildId - Build ID
   * @param {string} status - Build status (pending|running|completed|failed)
   * @param {number} executionTimeMs - Execution time in milliseconds
   * @returns {Promise<Object>} Updated build data
   */
  async updateBuildStatus(buildId, status, executionTimeMs = null) {
    const body = { status };
    if (executionTimeMs !== null) {
      body.executionTimeMs = executionTimeMs;
    }

    return this.request(`/api/sdk/builds/${buildId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Finalize a build (convenience method)
   * @param {string} buildId - Build ID
   * @param {boolean} success - Whether the build succeeded
   * @param {number} executionTimeMs - Execution time in milliseconds
   * @returns {Promise<Object>} Finalized build data
   */
  async finalizeBuild(buildId, success = true, executionTimeMs = null) {
    const status = success ? 'completed' : 'failed';
    return this.updateBuildStatus(buildId, status, executionTimeMs);
  }
}
