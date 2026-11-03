import * as output from '../../shared/output.js';
import { AuthError, VizzlyError } from '../../shared/vizzly-error.js';
import { getApiUrl } from '../config/environment.js';
import {
  buildTokenData,
  deviceAuthorizationStatus,
} from './auth.normalizers.js';
import {
  buildDevicePollPayload,
  buildLogoutPayload,
  buildRefreshPayload,
} from './auth.serializers.js';
import { validateTokens } from './auth.validations.js';
import { createAuthClient } from './auth-client.js';
import { createTokenStore } from './token-store.js';

/**
 * Auth Operations - Authentication operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - httpClient: for making HTTP requests
 * - tokenStore: for reading/writing auth tokens
 *
 * This makes them trivially testable without mocking modules.
 */

/**
 * Auth Service
 * Wraps auth operations for use by the HTTP server
 *
 * Provides the interface expected by src/domains/auth/auth.routes.js:
 * - isAuthenticated() - Returns boolean, false if no tokens or API call fails
 * - whoami() - Throws if not authenticated or tokens invalid
 * - initiateDeviceFlow() - Throws on API error
 * - pollDeviceAuthorization(deviceCode) - Returns pending status or tokens, throws on error
 * - completeDeviceFlow(tokens) - Saves tokens to global config
 * - logout() - Clears local tokens, may warn if server revocation fails
 * - authenticatedRequest(endpoint, options) - Throws 'Not authenticated' if no tokens
 *
 * Error handling:
 * - isAuthenticated() never throws, returns false on any error
 * - whoami() throws if tokens are missing/invalid (caller should check isAuthenticated first)
 * - authenticatedRequest() throws 'Not authenticated' if no access token
 * - Device flow methods throw on API errors (network, server errors)
 */

/**
 * Create an auth service instance
 * @param {Object} [options]
 * @param {string} [options.apiUrl] - API base URL (defaults to VIZZLY_API_URL or https://app.vizzly.dev)
 * @param {Object} [options.httpClient] - Injectable HTTP client (for testing)
 * @param {Object} [options.tokenStore] - Injectable token store (for testing)
 * @returns {Object} Auth service
 */
export function createAuthService(options = {}) {
  let apiUrl = options.apiUrl || getApiUrl();

  // Create HTTP client for API requests (uses auth client for proper auth handling)
  // Allow injection for testing
  let httpClient = options.httpClient || createAuthClient({ baseUrl: apiUrl });

  // Create token store adapter for global config
  // Allow injection for testing
  let tokenStore = options.tokenStore || createTokenStore();

  return {
    /**
     * Check if user is authenticated
     * @returns {Promise<boolean>}
     */
    async isAuthenticated() {
      return isAuthenticated(httpClient, tokenStore);
    },

    /**
     * Get current user information
     * @returns {Promise<Object>} User and organization data
     */
    async whoami() {
      return whoami(httpClient, tokenStore);
    },

    /**
     * Initiate OAuth device flow
     * @returns {Promise<Object>} Device code info
     */
    async initiateDeviceFlow() {
      return initiateDeviceFlow(httpClient);
    },

    /**
     * Poll for device authorization
     * @param {string} deviceCode
     * @returns {Promise<Object>} Token data or pending status
     */
    async pollDeviceAuthorization(deviceCode) {
      return pollDeviceAuthorization(httpClient, deviceCode);
    },

    /**
     * Complete device flow and save tokens
     * @param {Object} tokens - Token data
     * @returns {Promise<Object>}
     */
    async completeDeviceFlow(tokens) {
      return completeDeviceFlow(tokenStore, tokens);
    },

    /**
     * Logout and revoke tokens
     * @returns {Promise<void>}
     */
    async logout() {
      return logout(httpClient, tokenStore);
    },

    /**
     * Refresh access token
     * @returns {Promise<Object>} New tokens
     */
    async refresh() {
      return refresh(httpClient, tokenStore);
    },

    /**
     * Make an authenticated request to the API
     * Used by cloud-proxy router for proxying requests
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async authenticatedRequest(endpoint, options = {}) {
      let auth = await tokenStore.getTokens();
      if (!auth?.accessToken) {
        throw new Error('Not authenticated');
      }
      return httpClient.authenticatedRequest(
        endpoint,
        auth.accessToken,
        options
      );
    },
  };
}

/**
 * Initiate OAuth device flow
 * @param {Object} httpClient - HTTP client with request method
 * @returns {Promise<Object>} Device code, user code, verification URL
 */
export async function initiateDeviceFlow(httpClient) {
  return httpClient.request('/api/auth/cli/device/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Poll for device authorization
 * @param {Object} httpClient - HTTP client
 * @param {string} deviceCode - Device code from initiate
 * @returns {Promise<Object>} Token data or pending status
 */
export async function pollDeviceAuthorization(
  httpClient,
  deviceCode,
  options = {}
) {
  try {
    return await httpClient.request('/api/auth/cli/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDevicePollPayload(deviceCode)),
      signal: options.signal,
    });
  } catch (error) {
    let status = deviceAuthorizationStatus(error);
    if (status) return { status };
    throw error;
  }
}

/**
 * Complete device flow and save tokens
 * @param {Object} tokenStore - Token storage with saveTokens method
 * @param {Object} tokenData - Token response from poll
 * @returns {Promise<Object>} Token data
 */
export async function completeDeviceFlow(tokenStore, tokenData) {
  await tokenStore.saveTokens(buildTokenData(tokenData));
  return tokenData;
}

/**
 * Refresh access token using refresh token
 * @param {Object} httpClient - HTTP client
 * @param {Object} tokenStore - Token storage
 * @returns {Promise<Object>} New tokens
 */
export async function refresh(httpClient, tokenStore) {
  let auth = await tokenStore.getTokens();
  let validation = validateTokens(auth, 'refreshToken');

  if (!validation.valid) {
    throw validation.error;
  }

  let response = await httpClient.request('/api/auth/cli/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRefreshPayload(auth.refreshToken)),
  });

  if (
    typeof response.accessToken !== 'string' ||
    !response.accessToken ||
    typeof response.refreshToken !== 'string' ||
    !response.refreshToken
  ) {
    throw new VizzlyError(
      'Vizzly returned an invalid login refresh response. Your saved session was preserved.',
      'INVALID_AUTH_RESPONSE'
    );
  }

  // Preserve existing user data when refreshing
  await tokenStore.saveTokens(buildTokenData(response, auth.user));

  return response;
}

/** One selected login and one refresh budget for a command's requests. */
export function createUserSession({
  baseUrl,
  command = 'projects',
  httpClient = createAuthClient({ baseUrl }),
  tokenStore = createTokenStore(),
} = {}) {
  let auth;
  let refreshAttempt;
  let loginRequired = () => {
    let error = new AuthError(
      `Your saved login has expired. Run vizzly login, then rerun vizzly ${command}.`,
      { status: 401 }
    );
    error.code = 'LOGIN_REQUIRED';
    return error;
  };
  async function renew() {
    if (refreshAttempt) return refreshAttempt;
    refreshAttempt = (async () => {
      auth = await tokenStore.getTokens();
      if (!auth?.refreshToken) throw loginRequired();
      try {
        await refresh(httpClient, tokenStore);
      } catch (error) {
        if ([400, 401, 403].includes(error.context?.status)) {
          throw loginRequired();
        }
        if (error.context?.status) {
          throw new VizzlyError(
            `Unable to refresh your login (HTTP ${error.context.status}). Try this command again later.`,
            'AUTH_REFRESH_UNAVAILABLE',
            error.context
          );
        }
        throw error;
      }
      auth = await tokenStore.getTokens();
      return auth.accessToken;
    })();
    return refreshAttempt;
  }
  async function prepare() {
    auth ||= await tokenStore.getTokens();
    if (!auth?.accessToken) throw loginRequired();
    if (
      auth.expiresAt &&
      !(Date.parse(auth.expiresAt) > Date.now() + 5 * 60 * 1000)
    ) {
      await renew();
    }
    return auth.accessToken;
  }
  return { prepare, renew, loginRequired, canRefresh: () => !refreshAttempt };
}

/**
 * Logout and revoke tokens
 * @param {Object} httpClient - HTTP client
 * @param {Object} tokenStore - Token storage
 * @returns {Promise<void>}
 */
export async function logout(httpClient, tokenStore) {
  let auth = await tokenStore.getTokens();

  if (auth?.refreshToken) {
    try {
      await httpClient.authenticatedRequest(
        '/api/auth/cli/logout',
        auth.accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildLogoutPayload(auth.refreshToken)),
        }
      );
    } catch (error) {
      // If server request fails, still clear local tokens
      output.warn(`Failed to revoke tokens on server: ${error.message}`);
    }
  }

  await tokenStore.clearTokens();
}

/**
 * Get current user information
 * @param {Object} httpClient - HTTP client
 * @param {Object} tokenStore - Token storage
 * @returns {Promise<Object>} User and organization data
 */
export async function whoami(httpClient, tokenStore) {
  let session = createUserSession({
    httpClient,
    tokenStore,
    command: 'whoami',
  });
  let token = await session.prepare();
  try {
    return await httpClient.authenticatedRequest('/api/auth/cli/whoami', token);
  } catch (error) {
    if (error.context?.status !== 401) throw error;
    if (!session.canRefresh()) throw session.loginRequired();
    token = await session.renew();
    return httpClient.authenticatedRequest('/api/auth/cli/whoami', token);
  }
}

/**
 * Check if user is authenticated
 * @param {Object} httpClient - HTTP client
 * @param {Object} tokenStore - Token storage
 * @returns {Promise<boolean>} True if authenticated
 */
export async function isAuthenticated(httpClient, tokenStore) {
  try {
    await whoami(httpClient, tokenStore);
    return true;
  } catch {
    return false;
  }
}
