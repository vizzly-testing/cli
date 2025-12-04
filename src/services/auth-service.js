/**
 * Authentication Service for Vizzly CLI
 * Handles authentication flows with the Vizzly API
 */

import { AuthError, VizzlyError } from '../errors/vizzly-error.js';
import { getApiUrl } from '../utils/environment-config.js';
import {
  clearAuthTokens,
  getAuthTokens,
  saveAuthTokens,
} from '../utils/global-config.js';
import { getPackageVersion } from '../utils/package-info.js';

/**
 * AuthService class for CLI authentication
 */
export class AuthService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || getApiUrl();
    this.userAgent = `vizzly-cli/${getPackageVersion()} (auth)`;
  }

  /**
   * Make an unauthenticated API request
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

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorText = '';
      let errorData = null;

      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          errorData = await response.json();
          errorText = errorData.error || errorData.message || '';
        } else {
          errorText = await response.text();
        }
      } catch {
        errorText = response.statusText || '';
      }

      if (response.status === 401) {
        throw new AuthError(
          errorText ||
            'Invalid credentials. Please check your email/username and password.'
        );
      }

      if (response.status === 429) {
        throw new VizzlyError(
          'Too many login attempts. Please try again later.',
          'RATE_LIMIT_ERROR'
        );
      }

      throw new VizzlyError(
        `Authentication request failed: ${response.status}${errorText ? ` - ${errorText}` : ''}`,
        'AUTH_REQUEST_ERROR'
      );
    }

    return response.json();
  }

  /**
   * Make an authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async authenticatedRequest(endpoint, options = {}) {
    const auth = await getAuthTokens();

    if (!auth || !auth.accessToken) {
      throw new AuthError(
        'No authentication token found. Please run "vizzly login" first.'
      );
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'User-Agent': this.userAgent,
      Authorization: `Bearer ${auth.accessToken}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorText = '';

      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const errorData = await response.json();
          errorText = errorData.error || errorData.message || '';
        } else {
          errorText = await response.text();
        }
      } catch {
        errorText = response.statusText || '';
      }

      if (response.status === 401) {
        throw new AuthError(
          'Authentication token is invalid or expired. Please run "vizzly login" again.'
        );
      }

      throw new VizzlyError(
        `API request failed: ${response.status}${errorText ? ` - ${errorText}` : ''} (${endpoint})`,
        'API_REQUEST_ERROR'
      );
    }

    return response.json();
  }

  /**
   * Initiate OAuth device flow
   * @returns {Promise<Object>} Device code, user code, verification URL
   */
  async initiateDeviceFlow() {
    return this.request('/api/auth/cli/device/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Poll for device authorization
   * @param {string} deviceCode - Device code from initiate
   * @returns {Promise<Object>} Token data or pending status
   */
  async pollDeviceAuthorization(deviceCode) {
    return this.request('/api/auth/cli/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    });
  }

  /**
   * Complete device flow and save tokens
   * @param {Object} tokenData - Token response from poll
   * @returns {Promise<Object>} Token data with user info
   */
  async completeDeviceFlow(tokenData) {
    // Save tokens to global config
    await saveAuthTokens({
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      user: tokenData.user,
    });

    return tokenData;
  }

  /**
   * Refresh access token using refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refresh() {
    const auth = await getAuthTokens();

    if (!auth || !auth.refreshToken) {
      throw new AuthError(
        'No refresh token found. Please run "vizzly login" first.'
      );
    }

    const response = await this.request('/api/auth/cli/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: auth.refreshToken,
      }),
    });

    // Update tokens in global config
    await saveAuthTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: response.expiresAt,
      user: auth.user, // Keep existing user data
    });

    return response;
  }

  /**
   * Logout and revoke tokens
   * @returns {Promise<void>}
   */
  async logout() {
    const auth = await getAuthTokens();

    if (auth?.refreshToken) {
      try {
        // Attempt to revoke tokens on server
        await this.request('/api/auth/cli/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refreshToken: auth.refreshToken,
          }),
        });
      } catch (error) {
        // If server request fails, still clear local tokens
        console.warn(
          'Warning: Failed to revoke tokens on server:',
          error.message
        );
      }
    }

    // Clear tokens from global config
    await clearAuthTokens();
  }

  /**
   * Get current user information
   * @returns {Promise<Object>} User and organization data
   */
  async whoami() {
    return this.authenticatedRequest('/api/auth/cli/whoami');
  }

  /**
   * Check if user is authenticated
   * @returns {Promise<boolean>} True if authenticated
   */
  async isAuthenticated() {
    try {
      await this.whoami();
      return true;
    } catch {
      return false;
    }
  }
}
