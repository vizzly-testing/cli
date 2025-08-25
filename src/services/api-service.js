/**
 * API Service for Vizzly
 * Handles HTTP requests to the Vizzly API
 */

import { URLSearchParams } from 'url';
import { VizzlyError } from '../errors/vizzly-error.js';
import crypto from 'crypto';
import { getPackageVersion } from '../utils/package-info.js';
import {
  getApiUrl,
  getApiToken,
  getUserAgent,
} from '../utils/environment-config.js';

/**
 * ApiService class for direct API communication
 */
export class ApiService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || getApiUrl();
    this.token = options.token || getApiToken();
    this.uploadAll = options.uploadAll || false;

    // Build User-Agent string
    const command = options.command || 'run'; // Default to 'run' for API service
    const baseUserAgent = `vizzly-cli/${getPackageVersion()} (${command})`;
    const sdkUserAgent = options.userAgent || getUserAgent();
    this.userAgent = sdkUserAgent
      ? `${baseUserAgent} ${sdkUserAgent}`
      : baseUserAgent;

    if (!this.token && !options.allowNoToken) {
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
    const headers = {
      'User-Agent': this.userAgent,
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorText = '';
      try {
        if (typeof response.text === 'function') {
          errorText = await response.text();
        } else {
          errorText = response.statusText || '';
        }
      } catch {
        // ignore
      }
      throw new VizzlyError(
        `API request failed: ${response.status}${errorText ? ` - ${errorText}` : ''} (URL: ${url})`
      );
    }

    return response.json();
  }

  /**
   * Get build information
   * @param {string} buildId - Build ID
   * @param {string} include - Optional include parameter (e.g., 'screenshots')
   * @returns {Promise<Object>} Build data
   */
  async getBuild(buildId, include = null) {
    const endpoint = include
      ? `/api/sdk/builds/${buildId}?include=${include}`
      : `/api/sdk/builds/${buildId}`;
    return this.request(endpoint);
  }

  /**
   * Get comparison information
   * @param {string} comparisonId - Comparison ID
   * @returns {Promise<Object>} Comparison data
   */
  async getComparison(comparisonId) {
    return this.request(`/api/sdk/comparisons/${comparisonId}`);
  }

  /**
   * Get builds for a project
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} List of builds
   */
  async getBuilds(filters = {}) {
    const queryParams = new URLSearchParams(filters).toString();
    const endpoint = `/api/sdk/builds${queryParams ? `?${queryParams}` : ''}`;
    return this.request(endpoint);
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
      body: JSON.stringify({ build: metadata }),
    });
  }

  /**
   * Check if SHAs already exist on the server
   * @param {string[]} shas - Array of SHA256 hashes to check
   * @param {string} buildId - Build ID for screenshot record creation
   * @returns {Promise<Object>} Response with existing SHAs and screenshot data
   */
  async checkShas(shas, buildId) {
    try {
      const response = await this.request('/api/sdk/check-shas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shas, buildId }),
      });
      return response;
    } catch (error) {
      // Continue without deduplication on error
      console.debug(
        'SHA check failed, continuing without deduplication:',
        error.message
      );
      return { existing: [], missing: shas, screenshots: [] };
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
    // Skip SHA deduplication entirely if uploadAll flag is set
    if (this.uploadAll) {
      // Upload directly without SHA calculation or checking
      return this.request(`/api/sdk/builds/${buildId}/screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          image_data: buffer.toString('base64'),
          properties: metadata ?? {},
          // No SHA included when bypassing deduplication
        }),
      });
    }

    // Normal flow with SHA deduplication
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check if this SHA already exists
    const checkResult = await this.checkShas([sha256], buildId);

    if (checkResult.existing && checkResult.existing.includes(sha256)) {
      // File already exists, screenshot record was automatically created
      const screenshot = checkResult.screenshots?.find(
        s => s.sha256 === sha256
      );
      return {
        message: 'Screenshot already exists, skipped upload',
        sha256,
        skipped: true,
        screenshot,
        fromExisting: true,
      };
    }

    // File doesn't exist, proceed with upload
    return this.request(`/api/sdk/builds/${buildId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        image_data: buffer.toString('base64'),
        properties: metadata ?? {},
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

  /**
   * Get token context (organization and project info)
   * @returns {Promise<Object>} Token context data
   */
  async getTokenContext() {
    return this.request('/api/sdk/token/context');
  }

  /**
   * Finalize a parallel build
   * @param {string} parallelId - Parallel ID to finalize
   * @returns {Promise<Object>} Finalization result
   */
  async finalizeParallelBuild(parallelId) {
    return this.request(`/api/sdk/parallel/${parallelId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
