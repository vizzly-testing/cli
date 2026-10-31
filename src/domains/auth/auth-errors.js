import { AuthError, VizzlyError } from '../../errors/vizzly-error.js';

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
