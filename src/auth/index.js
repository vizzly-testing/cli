/**
 * Auth Module - Public exports
 *
 * Provides functional authentication primitives:
 * - core.js: Pure functions for headers, payloads, error parsing
 * - client.js: HTTP client factory
 * - operations.js: Auth operations with dependency injection
 */

// Re-export token store utilities for convenience
export {
  clearAuthTokens,
  getAuthTokens,
  saveAuthTokens,
} from '../utils/global-config.js';
// HTTP client factory
export { createAuthClient } from './client.js';
// Core pure functions
export {
  buildAuthHeader,
  buildAuthUserAgent,
  buildDevicePollPayload,
  buildLogoutPayload,
  buildRefreshPayload,
  buildRequestHeaders,
  buildTokenData,
  parseAuthError,
  parseAuthenticatedError,
  validateTokens,
} from './core.js';
// Auth operations (take dependencies as parameters)
export {
  completeDeviceFlow,
  initiateDeviceFlow,
  isAuthenticated,
  logout,
  pollDeviceAuthorization,
  refresh,
  whoami,
} from './operations.js';

/**
 * Create a token store adapter from global-config functions
 * Used by auth operations that need tokenStore parameter
 */
export function createTokenStore() {
  return {
    getTokens: getAuthTokens,
    saveTokens: saveAuthTokens,
    clearTokens: clearAuthTokens,
  };
}
