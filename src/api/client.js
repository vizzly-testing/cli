/**
 * API Client Factory
 *
 * Creates a configured API client for making HTTP requests to Vizzly.
 * The client handles authentication, token refresh, and error handling.
 */

import { AuthError, VizzlyError } from '../errors/vizzly-error.js';
import { getAuthTokens, saveAuthTokens } from '../utils/global-config.js';
import { getPackageVersion } from '../utils/package-info.js';
import {
  buildApiUrl,
  buildRequestHeaders,
  buildUserAgent,
  extractErrorBody,
  isAuthError,
  parseApiError,
  shouldRetryWithRefresh,
} from './core.js';

/**
 * Default API URL
 */
export let DEFAULT_API_URL = 'https://app.vizzly.dev';

/**
 * Create an API client with the given configuration
 *
 * @param {Object} options - Client options
 * @param {string} options.baseUrl - Base API URL
 * @param {string} options.token - API token (apiKey)
 * @param {string} options.command - Command name for user agent
 * @param {string} options.sdkUserAgent - Optional SDK user agent string
 * @param {boolean} options.allowNoToken - Allow requests without token
 * @returns {Object} API client with request method
 */
export function createApiClient(options = {}) {
  let baseUrl = options.baseUrl || options.apiUrl || DEFAULT_API_URL;
  let token = options.token || options.apiKey || null;
  let command = options.command || 'api';
  let version = getPackageVersion();
  let userAgent = buildUserAgent(
    version,
    command,
    options.sdkUserAgent || options.userAgent
  );
  let allowNoToken = options.allowNoToken || false;

  // Validate token requirement
  if (!token && !allowNoToken) {
    throw new VizzlyError(
      'No API token provided. Set VIZZLY_TOKEN environment variable or link a project in the TDD dashboard.'
    );
  }

  /**
   * Make an API request
   *
   * @param {string} endpoint - API endpoint (e.g., '/api/sdk/builds')
   * @param {Object} fetchOptions - Fetch options (method, body, headers, etc.)
   * @param {boolean} isRetry - Whether this is a retry after token refresh
   * @returns {Promise<Object>} Parsed JSON response
   */
  async function request(endpoint, fetchOptions = {}, isRetry = false) {
    let url = buildApiUrl(baseUrl, endpoint);

    let headers = buildRequestHeaders({
      token,
      userAgent,
      contentType: fetchOptions.headers?.['Content-Type'],
      extra: fetchOptions.headers || {},
    });

    let response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      let errorBody = await extractErrorBody(response);

      // Handle 401 with token refresh
      if (
        shouldRetryWithRefresh(
          response.status,
          isRetry,
          await hasRefreshToken()
        )
      ) {
        let refreshed = await attemptTokenRefresh();
        if (refreshed) {
          token = refreshed;
          return request(endpoint, fetchOptions, true);
        }
      }

      // Auth error
      if (isAuthError(response.status)) {
        throw new AuthError(
          'Invalid or expired API token. Link a project via "vizzly project:select" or set VIZZLY_TOKEN.'
        );
      }

      // Other errors
      let error = parseApiError(response.status, errorBody, url);
      throw new VizzlyError(error.message, error.code);
    }

    return response.json();
  }

  /**
   * Check if refresh token is available
   */
  async function hasRefreshToken() {
    let auth = await getAuthTokens();
    return !!auth?.refreshToken;
  }

  /**
   * Attempt to refresh the access token
   * @returns {Promise<string|null>} New token or null if refresh failed
   */
  async function attemptTokenRefresh() {
    let auth = await getAuthTokens();
    if (!auth?.refreshToken) return null;

    try {
      let refreshUrl = buildApiUrl(baseUrl, '/api/auth/cli/refresh');
      let response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      });

      if (!response.ok) return null;

      let data = await response.json();

      // Save new tokens
      await saveAuthTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        user: auth.user,
      });

      return data.accessToken;
    } catch {
      return null;
    }
  }

  return {
    request,
    getBaseUrl: () => baseUrl,
    getToken: () => token,
    getUserAgent: () => userAgent,
  };
}
