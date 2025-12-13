/**
 * Auth Module - Public exports
 *
 * Provides functional authentication primitives:
 * - core.js: Pure functions for headers, payloads, error parsing
 * - client.js: HTTP client factory
 * - operations.js: Auth operations with dependency injection
 */

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
