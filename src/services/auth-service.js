/**
 * Auth Service
 * Wraps auth operations for use by the HTTP server
 *
 * Provides the interface expected by src/server/routers/auth.js:
 * - isAuthenticated()
 * - whoami()
 * - initiateDeviceFlow()
 * - pollDeviceAuthorization(deviceCode)
 * - completeDeviceFlow(tokens)
 * - logout()
 */

import { createAuthClient } from '../auth/client.js';
import * as authOps from '../auth/operations.js';
import {
  clearAuthTokens,
  getAuthTokens,
  saveAuthTokens,
} from '../utils/global-config.js';

/**
 * Create an auth service instance
 * @param {Object} [options]
 * @param {string} [options.apiUrl] - API base URL (defaults to VIZZLY_API_URL or https://app.vizzly.dev)
 * @returns {Object} Auth service
 */
export function createAuthService(options = {}) {
  let apiUrl =
    options.apiUrl || process.env.VIZZLY_API_URL || 'https://app.vizzly.dev';

  // Create HTTP client for API requests (uses auth client for proper auth handling)
  let httpClient = createAuthClient({ baseUrl: apiUrl });

  // Create token store adapter for global config
  let tokenStore = {
    getTokens: getAuthTokens,
    saveTokens: saveAuthTokens,
    clearTokens: clearAuthTokens,
  };

  return {
    /**
     * Check if user is authenticated
     * @returns {Promise<boolean>}
     */
    async isAuthenticated() {
      return authOps.isAuthenticated(httpClient, tokenStore);
    },

    /**
     * Get current user information
     * @returns {Promise<Object>} User and organization data
     */
    async whoami() {
      return authOps.whoami(httpClient, tokenStore);
    },

    /**
     * Initiate OAuth device flow
     * @returns {Promise<Object>} Device code info
     */
    async initiateDeviceFlow() {
      return authOps.initiateDeviceFlow(httpClient);
    },

    /**
     * Poll for device authorization
     * @param {string} deviceCode
     * @returns {Promise<Object>} Token data or pending status
     */
    async pollDeviceAuthorization(deviceCode) {
      return authOps.pollDeviceAuthorization(httpClient, deviceCode);
    },

    /**
     * Complete device flow and save tokens
     * @param {Object} tokens - Token data
     * @returns {Promise<Object>}
     */
    async completeDeviceFlow(tokens) {
      return authOps.completeDeviceFlow(tokenStore, tokens);
    },

    /**
     * Logout and revoke tokens
     * @returns {Promise<void>}
     */
    async logout() {
      return authOps.logout(httpClient, tokenStore);
    },

    /**
     * Refresh access token
     * @returns {Promise<Object>} New tokens
     */
    async refresh() {
      return authOps.refresh(httpClient, tokenStore);
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
