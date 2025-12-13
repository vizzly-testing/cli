/**
 * Auth Core - Pure functions for authentication logic
 *
 * No I/O, no side effects - just data transformations.
 */

import { AuthError, VizzlyError } from '../errors/vizzly-error.js';

// ============================================================================
// Header Building
// ============================================================================

/**
 * Build Authorization header from access token
 * @param {string|null} accessToken - Access token
 * @returns {Object} Headers object with Authorization if token exists
 */
export function buildAuthHeader(accessToken) {
  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Build User-Agent header for auth requests
 * @param {string} version - CLI version
 * @returns {string} User-Agent string
 */
export function buildAuthUserAgent(version) {
  return `vizzly-cli/${version} (auth)`;
}

/**
 * Build complete headers for a request
 * @param {Object} options - Header options
 * @returns {Object} Complete headers object
 */
export function buildRequestHeaders({
  userAgent,
  accessToken,
  contentType,
  extra = {},
}) {
  return {
    'User-Agent': userAgent,
    ...(accessToken ? buildAuthHeader(accessToken) : {}),
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...extra,
  };
}

// ============================================================================
// Error Parsing
// ============================================================================

/**
 * Parse error from API response
 * @param {number} status - HTTP status code
 * @param {Object|string} body - Response body (parsed JSON or text)
 * @param {string} endpoint - API endpoint for context
 * @returns {Error} Appropriate error type
 */
export function parseAuthError(status, body, _endpoint) {
  let errorText = '';

  if (typeof body === 'object' && body !== null) {
    errorText = body.error || body.message || '';
  } else if (typeof body === 'string') {
    errorText = body;
  }

  if (status === 401) {
    return new AuthError(
      errorText ||
        'Invalid credentials. Please check your email/username and password.'
    );
  }

  if (status === 429) {
    return new VizzlyError(
      'Too many login attempts. Please try again later.',
      'RATE_LIMIT_ERROR'
    );
  }

  return new VizzlyError(
    `Authentication request failed: ${status}${errorText ? ` - ${errorText}` : ''}`,
    'AUTH_REQUEST_ERROR'
  );
}

/**
 * Parse error for authenticated requests (different error messages)
 * @param {number} status - HTTP status code
 * @param {Object|string} body - Response body
 * @param {string} endpoint - API endpoint
 * @returns {Error} Appropriate error type
 */
export function parseAuthenticatedError(status, body, endpoint) {
  let errorText = '';

  if (typeof body === 'object' && body !== null) {
    errorText = body.error || body.message || '';
  } else if (typeof body === 'string') {
    errorText = body;
  }

  if (status === 401) {
    return new AuthError(
      'Authentication token is invalid or expired. Please run "vizzly login" again.'
    );
  }

  return new VizzlyError(
    `API request failed: ${status}${errorText ? ` - ${errorText}` : ''} (${endpoint})`,
    'API_REQUEST_ERROR'
  );
}

// ============================================================================
// Payload Building
// ============================================================================

/**
 * Build device poll request payload
 * @param {string} deviceCode - Device code from initiate
 * @returns {Object} Request payload
 */
export function buildDevicePollPayload(deviceCode) {
  return { device_code: deviceCode };
}

/**
 * Build refresh token request payload
 * @param {string} refreshToken - Refresh token
 * @returns {Object} Request payload
 */
export function buildRefreshPayload(refreshToken) {
  return { refreshToken };
}

/**
 * Build logout request payload
 * @param {string} refreshToken - Refresh token to revoke
 * @returns {Object} Request payload
 */
export function buildLogoutPayload(refreshToken) {
  return { refreshToken };
}

// ============================================================================
// Token Handling
// ============================================================================

/**
 * Build token data for storage from API response
 * @param {Object} response - API response with tokens
 * @param {Object|null} existingUser - Existing user data to preserve
 * @returns {Object} Token data for storage
 */
export function buildTokenData(response, existingUser = null) {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: response.expiresAt,
    user: response.user || existingUser,
  };
}

/**
 * Validate that tokens exist and have required fields
 * @param {Object|null} auth - Auth tokens object
 * @param {string} requiredField - Field that must exist ('accessToken' or 'refreshToken')
 * @returns {{ valid: boolean, error: Error|null }}
 */
export function validateTokens(auth, requiredField = 'accessToken') {
  if (!auth || !auth[requiredField]) {
    let message =
      requiredField === 'refreshToken'
        ? 'No refresh token found. Please run "vizzly login" first.'
        : 'No authentication token found. Please run "vizzly login" first.';

    return { valid: false, error: new AuthError(message) };
  }

  return { valid: true, error: null };
}
