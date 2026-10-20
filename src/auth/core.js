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

  let retryAfter = Number(body?.retryAfter);
  let context = {
    status,
    serverCode: body?.code,
    retryAfter: retryAfter > 0 ? retryAfter : undefined,
  };

  if (status === 401) {
    return new AuthError(
      errorText ||
        'Invalid credentials. Please check your email/username and password.',
      context
    );
  }

  if (status === 429) {
    return new VizzlyError(
      'Too many login attempts. Please try again later.',
      'RATE_LIMIT_ERROR',
      context
    );
  }

  return new VizzlyError(
    `Authentication request failed: ${status}${errorText ? ` - ${errorText}` : ''}`,
    'AUTH_REQUEST_ERROR',
    context
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
  if (!auth?.[requiredField]) {
    let message =
      requiredField === 'refreshToken'
        ? 'No refresh token found. Please run "vizzly login" first.'
        : 'No authentication token found. Please run "vizzly login" first.';

    return { valid: false, error: new AuthError(message) };
  }

  return { valid: true, error: null };
}

export function normalizeDeviceFlowResponse(deviceFlow) {
  let verificationUri =
    deviceFlow.verification_uri || deviceFlow.verificationUri;
  let userCode = deviceFlow.user_code || deviceFlow.userCode;
  let deviceCode = deviceFlow.device_code || deviceFlow.deviceCode;

  if (!verificationUri || !userCode || !deviceCode) {
    throw new Error('Invalid device flow response from server');
  }

  return {
    verificationUri,
    userCode,
    deviceCode,
    urlWithCode:
      deviceFlow.verification_uri_complete ||
      deviceFlow.verificationUriComplete ||
      `${verificationUri}?code=${encodeURIComponent(userCode)}`,
  };
}

export function resolveAuthorizedTokenData(pollResponse) {
  let accessToken =
    pollResponse.tokens?.accessToken || pollResponse.tokens?.access_token;

  if (accessToken) {
    return pollResponse;
  }

  if (pollResponse.status === 'pending') {
    throw new Error(
      'Authorization not complete yet. Please complete the authorization in your browser and try running "vizzly login" again.'
    );
  }
  if (pollResponse.status === 'expired') {
    throw new Error('Device code expired. Please try logging in again.');
  }
  if (pollResponse.status === 'invalid') {
    throw new Error(
      'Device code is invalid or expired. Please try logging in again.'
    );
  }
  if (pollResponse.status === 'denied') {
    throw new Error('Authorization denied. Please try logging in again.');
  }

  throw new Error(
    'Unexpected response from authorization server. Please try logging in again.'
  );
}

export function buildTokens(tokenData, now = Date.now()) {
  let tokensData = tokenData.tokens || tokenData;
  let tokenExpiresIn = tokensData.expiresIn || tokensData.expires_in;
  let tokenExpiresAt = tokenExpiresIn
    ? new Date(now + tokenExpiresIn * 1000).toISOString()
    : tokenData.expires_at || tokenData.expiresAt;

  return {
    accessToken: tokensData.accessToken || tokensData.access_token,
    refreshToken: tokensData.refreshToken || tokensData.refresh_token,
    expiresAt: tokenExpiresAt,
    user: tokenData.user,
    organizations: tokenData.organizations,
  };
}

/** Map protocol codes without depending on the server's human-readable text. */
export function deviceAuthorizationStatus(error) {
  return {
    AUTHORIZATION_PENDING: 'pending',
    ACCESS_DENIED: 'denied',
    EXPIRED_TOKEN: 'expired',
    INVALID_DEVICE_CODE: 'invalid',
  }[error.context?.serverCode];
}
