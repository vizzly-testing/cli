/**
 * Authentication Service for Vizzly CLI
 *
 * This class wraps the functional auth module for backwards compatibility.
 * New code should use the functions from '../auth/index.js' directly.
 */

import {
  completeDeviceFlow,
  createAuthClient,
  initiateDeviceFlow,
  isAuthenticated,
  logout,
  pollDeviceAuthorization,
  refresh,
  validateTokens,
  whoami,
} from '../auth/index.js';
import { getApiUrl } from '../utils/environment-config.js';
import {
  clearAuthTokens,
  getAuthTokens,
  saveAuthTokens,
} from '../utils/global-config.js';

/**
 * Create a token store adapter from global-config functions
 */
function createTokenStore() {
  return {
    getTokens: getAuthTokens,
    saveTokens: saveAuthTokens,
    clearTokens: clearAuthTokens,
  };
}

/**
 * AuthService class for CLI authentication
 */
export class AuthService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || getApiUrl();
    this.client = createAuthClient({ baseUrl: this.baseUrl });
    this.tokenStore = createTokenStore();
    this.userAgent = this.client.getUserAgent();
  }

  /**
   * Make an unauthenticated API request
   */
  async request(endpoint, options = {}) {
    return this.client.request(endpoint, options);
  }

  /**
   * Make an authenticated API request
   */
  async authenticatedRequest(endpoint, options = {}) {
    let auth = await this.tokenStore.getTokens();
    let validation = validateTokens(auth, 'accessToken');

    if (!validation.valid) {
      throw validation.error;
    }

    return this.client.authenticatedRequest(
      endpoint,
      auth.accessToken,
      options
    );
  }

  /**
   * Initiate OAuth device flow
   */
  async initiateDeviceFlow() {
    return initiateDeviceFlow(this.client);
  }

  /**
   * Poll for device authorization
   */
  async pollDeviceAuthorization(deviceCode) {
    return pollDeviceAuthorization(this.client, deviceCode);
  }

  /**
   * Complete device flow and save tokens
   */
  async completeDeviceFlow(tokenData) {
    return completeDeviceFlow(this.tokenStore, tokenData);
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh() {
    return refresh(this.client, this.tokenStore);
  }

  /**
   * Logout and revoke tokens
   */
  async logout() {
    return logout(this.client, this.tokenStore);
  }

  /**
   * Get current user information
   */
  async whoami() {
    return whoami(this.client, this.tokenStore);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    return isAuthenticated(this.client, this.tokenStore);
  }
}
