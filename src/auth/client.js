/**
 * Auth Client - HTTP client factory for authentication
 *
 * Creates a thin HTTP wrapper that can be injected into operations.
 */

import { getPackageVersion } from '../utils/package-info.js';
import {
  buildAuthUserAgent,
  buildRequestHeaders,
  parseAuthError,
  parseAuthenticatedError,
} from './core.js';

/**
 * Parse response body based on content type
 * @param {Response} response - Fetch response
 * @returns {Promise<Object|string>} Parsed body
 */
async function parseResponseBody(response) {
  try {
    let contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch {
    return response.statusText || '';
  }
}

/**
 * Create an auth HTTP client
 * @param {Object} options - Client options
 * @param {string} options.baseUrl - API base URL
 * @param {string} [options.userAgent] - Custom user agent
 * @returns {Object} Auth client with request methods
 */
export function createAuthClient(options = {}) {
  let { baseUrl, userAgent } = options;

  if (!userAgent) {
    userAgent = buildAuthUserAgent(getPackageVersion());
  }

  /**
   * Make an unauthenticated request
   */
  async function request(endpoint, fetchOptions = {}) {
    let url = `${baseUrl}${endpoint}`;
    let headers = buildRequestHeaders({
      userAgent,
      contentType: fetchOptions.headers?.['Content-Type'],
      extra: fetchOptions.headers,
    });

    let response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      let body = await parseResponseBody(response);
      throw parseAuthError(response.status, body, endpoint);
    }

    return response.json();
  }

  /**
   * Make an authenticated request
   */
  async function authenticatedRequest(
    endpoint,
    accessToken,
    fetchOptions = {}
  ) {
    let url = `${baseUrl}${endpoint}`;
    let headers = buildRequestHeaders({
      userAgent,
      accessToken,
      contentType: fetchOptions.headers?.['Content-Type'],
      extra: fetchOptions.headers,
    });

    let response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      let body = await parseResponseBody(response);
      throw parseAuthenticatedError(response.status, body, endpoint);
    }

    return response.json();
  }

  return {
    request,
    authenticatedRequest,
    getBaseUrl: () => baseUrl,
    getUserAgent: () => userAgent,
  };
}
