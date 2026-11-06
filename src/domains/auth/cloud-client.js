/**
 * API Client Factory
 *
 * Creates a configured API client for making HTTP requests to Vizzly.
 * The client handles authentication, token refresh, and error handling.
 */

import {
  buildApiUrl,
  buildRequestHeaders,
  buildUserAgent,
  extractErrorBody,
  parseApiError,
} from '../../shared/cloud-protocol.js';
import { getPackageVersion } from '../../shared/package-info.js';
import { AuthError, VizzlyError } from '../../shared/vizzly-error.js';
import { attributeReviewRequest } from './agent-attribution.js';
import { createInsufficientScopeError } from './auth-errors.js';

/**
 * Default API URL
 */
export const DEFAULT_API_URL = 'https://app.vizzly.dev';

/** Prefer the transport cause because Node's top-level fetch message is generic. */
function getNetworkFailureReason(error) {
  return (
    error?.cause?.code ||
    error?.cause?.message ||
    error?.message ||
    'request failed'
  );
}

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
  let session = options.credential?.session;

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
    fetchOptions = attributeReviewRequest(
      endpoint,
      fetchOptions,
      options.attribution,
      options.env
    );
    let {
      responseType = 'json',
      retryAuthentication = ['GET', 'HEAD'].includes(
        fetchOptions.method || 'GET'
      ),
      ...httpOptions
    } = fetchOptions;
    if (session) token = await session.prepare();
    let url = buildApiUrl(baseUrl, endpoint);

    let headers = buildRequestHeaders({
      token,
      userAgent,
      contentType: fetchOptions.headers?.['Content-Type'],
      extra: fetchOptions.headers || {},
    });

    let response;
    try {
      response = await fetch(url, {
        ...httpOptions,
        headers,
      });
    } catch (error) {
      let apiOrigin = new URL(url).origin;
      let reason = getNetworkFailureReason(error);
      throw new VizzlyError(
        `Unable to reach Vizzly at ${apiOrigin}: ${reason}`,
        'NETWORK_ERROR',
        { apiOrigin }
      );
    }

    if (!response.ok) {
      let errorBody = await extractErrorBody(response);

      if (response.status === 401) {
        if (retryAuthentication && !isRetry && session?.canRefresh()) {
          token = await session.renew();
          return request(endpoint, fetchOptions, true);
        }
        if (session) throw session.loginRequired();
        throw new AuthError(
          'Invalid or expired API token. Replace the selected --token, VIZZLY_TOKEN, or linked project credential. For account access, use --auth user.',
          { status: response.status }
        );
      }

      // Permission denials keep the selected identity and never trigger refresh.
      if (response.status === 403) {
        let body;
        try {
          body = JSON.parse(errorBody);
        } catch {
          // Preserve ordinary non-JSON errors through the shared parser.
        }
        if ((body?.code || body?.details?.code) === 'INSUFFICIENT_SCOPE') {
          throw createInsufficientScopeError({
            requiredScopes: body.requiredScopes || body.details?.requiredScopes,
            grantedScopes: body.grantedScopes || body.details?.grantedScopes,
          });
        }
      }
      let error = parseApiError(response.status, errorBody, url);
      throw new VizzlyError(error.message, error.code, {
        status: error.status,
        details: error.details,
      });
    }

    if (responseType === 'response') return response;
    if (response.status === 204 || httpOptions.method === 'HEAD') return null;
    let contentType = response.headers?.get?.('content-type');
    if (
      contentType &&
      !/application\/(?:[\w.+-]+\+)?json\b/i.test(contentType)
    ) {
      throw new VizzlyError(
        'This response contains file data. Use api --output <file> to download it.',
        'BINARY_RESPONSE'
      );
    }
    return response.json();
  }

  return {
    request,
    getBaseUrl: () => baseUrl,
    getToken: () => token,
    getUserAgent: () => userAgent,
  };
}
