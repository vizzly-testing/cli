/**
 * Auth Operations - Authentication operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - httpClient: for making HTTP requests
 * - tokenStore: for reading/writing auth tokens
 *
 * This makes them trivially testable without mocking modules.
 */

import {
  buildDevicePollPayload,
  buildLogoutPayload,
  buildRefreshPayload,
  buildTokenData,
  validateTokens,
} from './core.js';

// ============================================================================
// Device Flow Operations
// ============================================================================

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
export async function pollDeviceAuthorization(httpClient, deviceCode) {
  return httpClient.request('/api/auth/cli/device/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDevicePollPayload(deviceCode)),
  });
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

// ============================================================================
// Token Operations
// ============================================================================

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

  // Preserve existing user data when refreshing
  await tokenStore.saveTokens(buildTokenData(response, auth.user));

  return response;
}

// ============================================================================
// Logout Operations
// ============================================================================

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
      await httpClient.request('/api/auth/cli/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildLogoutPayload(auth.refreshToken)),
      });
    } catch (error) {
      // If server request fails, still clear local tokens
      console.warn(
        'Warning: Failed to revoke tokens on server:',
        error.message
      );
    }
  }

  await tokenStore.clearTokens();
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Get current user information
 * @param {Object} httpClient - HTTP client
 * @param {Object} tokenStore - Token storage
 * @returns {Promise<Object>} User and organization data
 */
export async function whoami(httpClient, tokenStore) {
  let auth = await tokenStore.getTokens();
  let validation = validateTokens(auth, 'accessToken');

  if (!validation.valid) {
    throw validation.error;
  }

  return httpClient.authenticatedRequest(
    '/api/auth/cli/whoami',
    auth.accessToken
  );
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
