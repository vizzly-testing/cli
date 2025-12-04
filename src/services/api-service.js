/**
 * API Service for Vizzly
 * Handles HTTP requests to the Vizzly API
 */

import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { AuthError, VizzlyError } from '../errors/vizzly-error.js';
import {
  getApiToken,
  getApiUrl,
  getUserAgent,
} from '../utils/environment-config.js';
import { getAuthTokens, saveAuthTokens } from '../utils/global-config.js';
import { getPackageVersion } from '../utils/package-info.js';

/**
 * ApiService class for direct API communication
 */
export class ApiService {
  constructor(options = {}) {
    // Accept config as-is, no fallbacks to environment
    // Config-loader handles all env/file resolution
    this.baseUrl = options.apiUrl || options.baseUrl || getApiUrl();
    this.token = options.apiKey || options.token || getApiToken(); // Accept both apiKey and token
    this.uploadAll = options.uploadAll || false;

    // Build User-Agent string
    const command = options.command || 'run';
    const baseUserAgent = `vizzly-cli/${getPackageVersion()} (${command})`;
    const sdkUserAgent = options.userAgent || getUserAgent();
    this.userAgent = sdkUserAgent
      ? `${baseUserAgent} ${sdkUserAgent}`
      : baseUserAgent;

    if (!this.token && !options.allowNoToken) {
      throw new VizzlyError(
        'No API token provided. Set VIZZLY_TOKEN environment variable or link a project in the TDD dashboard.'
      );
    }
  }

  /**
   * Make an API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @param {boolean} isRetry - Internal flag to prevent infinite retry loops
   * @returns {Promise<Object>} Response data
   */
  async request(endpoint, options = {}, isRetry = false) {
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

      // Handle authentication errors with automatic token refresh
      if (response.status === 401 && !isRetry) {
        // Attempt to refresh token if we have refresh token in global config
        const auth = await getAuthTokens();

        if (auth?.refreshToken) {
          try {
            // Attempt token refresh
            const refreshResponse = await fetch(
              `${this.baseUrl}/api/auth/cli/refresh`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': this.userAgent,
                },
                body: JSON.stringify({ refreshToken: auth.refreshToken }),
              }
            );

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();

              // Save new tokens to global config
              await saveAuthTokens({
                accessToken: refreshData.accessToken,
                refreshToken: refreshData.refreshToken,
                expiresAt: refreshData.expiresAt,
                user: auth.user, // Keep existing user data
              });

              // Update token for this service instance
              this.token = refreshData.accessToken;

              // Retry the original request with new token
              return this.request(endpoint, options, true);
            }
          } catch {
            // Token refresh failed, fall through to auth error
          }
        }

        throw new AuthError(
          'Invalid or expired API token. Link a project via "vizzly project:select" or set VIZZLY_TOKEN.'
        );
      }

      if (response.status === 401) {
        throw new AuthError(
          'Invalid or expired API token. Link a project via "vizzly project:select" or set VIZZLY_TOKEN.'
        );
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
    const response = await this.request(`/api/sdk/comparisons/${comparisonId}`);
    return response.comparison;
  }

  /**
   * Search for comparisons by name across builds
   * @param {string} name - Screenshot name to search for
   * @param {Object} filters - Optional filters (branch, limit, offset)
   * @param {string} [filters.branch] - Filter by branch name
   * @param {number} [filters.limit=50] - Maximum number of results (default: 50)
   * @param {number} [filters.offset=0] - Pagination offset (default: 0)
   * @returns {Promise<Object>} Search results with comparisons and pagination
   */
  async searchComparisons(name, filters = {}) {
    if (!name || typeof name !== 'string') {
      throw new VizzlyError('name is required and must be a non-empty string');
    }

    const { branch, limit = 50, offset = 0 } = filters;

    const queryParams = new URLSearchParams({
      name,
      limit: String(limit),
      offset: String(offset),
    });

    // Only add branch if provided
    if (branch) queryParams.append('branch', branch);

    return this.request(`/api/sdk/comparisons/search?${queryParams}`);
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
   * @param {string[]|Object[]} shas - Array of SHA256 hashes to check, or array of screenshot objects with metadata
   * @param {string} buildId - Build ID for screenshot record creation
   * @returns {Promise<Object>} Response with existing SHAs and screenshot data
   */
  async checkShas(shas, buildId) {
    try {
      let requestBody;

      // Check if we're using the new signature-based format (array of objects) or legacy format (array of strings)
      if (
        Array.isArray(shas) &&
        shas.length > 0 &&
        typeof shas[0] === 'object' &&
        shas[0].sha256
      ) {
        // New signature-based format
        requestBody = {
          buildId,
          screenshots: shas,
        };
      } else {
        // Legacy SHA-only format
        requestBody = {
          shas,
          buildId,
        };
      }

      const response = await this.request('/api/sdk/check-shas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      return response;
    } catch (error) {
      // Continue without deduplication on error
      console.debug(
        'SHA check failed, continuing without deduplication:',
        error.message
      );
      // Extract SHAs for fallback response regardless of format
      const shaList =
        Array.isArray(shas) && shas.length > 0 && typeof shas[0] === 'object'
          ? shas.map(s => s.sha256)
          : shas;
      return { existing: [], missing: shaList, screenshots: [] };
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

    // Normal flow with SHA deduplication using signature-based format
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Create screenshot object with signature data for checking
    const screenshotCheck = [
      {
        sha256,
        name,
        browser: metadata?.browser || 'chrome',
        viewport_width: metadata?.viewport?.width || 1920,
        viewport_height: metadata?.viewport?.height || 1080,
      },
    ];

    // Check if this SHA with signature already exists
    const checkResult = await this.checkShas(screenshotCheck, buildId);

    if (checkResult.existing?.includes(sha256)) {
      // File already exists with same signature, screenshot record was automatically created
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

    // File doesn't exist or has different signature, proceed with upload
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

  /**
   * Get hotspot analysis for a single screenshot
   * @param {string} screenshotName - Screenshot name to get hotspots for
   * @param {Object} options - Optional settings
   * @param {number} [options.windowSize=20] - Number of historical builds to analyze
   * @returns {Promise<Object>} Hotspot analysis data
   */
  async getScreenshotHotspots(screenshotName, options = {}) {
    const { windowSize = 20 } = options;
    const queryParams = new URLSearchParams({ windowSize: String(windowSize) });
    const encodedName = encodeURIComponent(screenshotName);
    return this.request(
      `/api/sdk/screenshots/${encodedName}/hotspots?${queryParams}`
    );
  }

  /**
   * Batch get hotspot analysis for multiple screenshots
   * More efficient than calling getScreenshotHotspots for each screenshot
   * @param {string[]} screenshotNames - Array of screenshot names
   * @param {Object} options - Optional settings
   * @param {number} [options.windowSize=20] - Number of historical builds to analyze
   * @returns {Promise<Object>} Hotspots keyed by screenshot name
   */
  async getBatchHotspots(screenshotNames, options = {}) {
    const { windowSize = 20 } = options;
    return this.request('/api/sdk/screenshots/hotspots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot_names: screenshotNames,
        windowSize,
      }),
    });
  }
}
