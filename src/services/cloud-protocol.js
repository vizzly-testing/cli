import { URLSearchParams } from 'node:url';

/**
 * Build Authorization header for Bearer token auth
 * @param {string|null} token - API token
 * @returns {Object} Headers object with Authorization if token provided
 */
export function buildAuthHeader(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Build User-Agent string from components
 * @param {string} version - CLI version
 * @param {string} command - Command being executed (run, upload, tdd, etc.)
 * @param {string|null} sdkUserAgent - Optional SDK user agent to append
 * @param {string} nodeVersion - Node.js version to append
 * @returns {string} Complete User-Agent string
 */
export function buildUserAgent(
  version,
  command,
  sdkUserAgent = null,
  nodeVersion = process.versions.node
) {
  let baseUserAgent = `vizzly-cli/${version} (${command})`;
  let userAgentParts = [baseUserAgent];

  if (sdkUserAgent) {
    userAgentParts.push(sdkUserAgent);
  }

  if (nodeVersion) userAgentParts.push(`node/${nodeVersion}`);

  return userAgentParts.join(' ');
}

/**
 * Build complete request headers
 * @param {Object} options - Header options
 * @param {string|null} options.token - API token
 * @param {string} options.userAgent - User-Agent string
 * @param {string|null} options.contentType - Content-Type header
 * @param {Object} options.extra - Additional headers to merge
 * @returns {Object} Complete headers object
 */
export function buildRequestHeaders({
  token,
  userAgent,
  contentType = null,
  extra = {},
}) {
  let headers = {
    'User-Agent': userAgent,
    ...buildAuthHeader(token),
    ...extra,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
}

/**
 * Build URL query parameters from filter object
 * @param {Object} filters - Filter key-value pairs
 * @returns {string} URL-encoded query string (without leading ?)
 */
export function buildQueryParams(filters) {
  let params = new URLSearchParams();

  for (let [key, value] of Object.entries(filters)) {
    if (value != null && value !== '') {
      params.append(key, String(value));
    }
  }

  return params.toString();
}

/**
 * Check if HTTP status indicates an auth error
 * @param {number} status - HTTP status code
 * @returns {boolean} True if auth error
 */
export function isAuthError(status) {
  return status === 401;
}

/**
 * Check if HTTP status indicates rate limiting
 * @param {number} status - HTTP status code
 * @returns {boolean} True if rate limited
 */
export function isRateLimited(status) {
  return status === 429;
}

/**
 * Parse error information from API response
 * @param {number} status - HTTP status code
 * @param {string} body - Response body text
 * @param {string} url - Request URL
 * @returns {Object} Parsed error info with message and code
 */
export function parseApiError(status, body, url) {
  let message = `API request failed: ${status}`;
  let responseDetails = null;
  let responseCode = null;
  let responseMessage = body;

  if (body) {
    try {
      let parsedBody = JSON.parse(body);
      responseDetails = parsedBody.details ?? null;
      responseCode = parsedBody.code ?? parsedBody.details?.code ?? null;
      responseMessage = parsedBody.error ?? parsedBody.message ?? body;
    } catch {
      // Plain-text API errors remain valid and are surfaced unchanged.
    }
  }

  if (responseMessage) {
    message += ` - ${responseMessage}`;
  }

  message += ` (URL: ${url})`;

  let code = 'API_ERROR';
  if (status === 401) code = 'AUTH_ERROR';
  if (status === 403) code = 'FORBIDDEN';
  if (status === 404) code = 'NOT_FOUND';
  if (status === 429) code = 'RATE_LIMITED';
  if (status >= 500) code = 'SERVER_ERROR';

  return {
    message,
    code: responseCode || code,
    status,
    details: responseDetails,
  };
}

/**
 * Extract error message from response body (JSON or text)
 * @param {Response} response - Fetch Response object
 * @returns {Promise<string>} Error message
 */
export async function extractErrorBody(response) {
  try {
    if (typeof response.text === 'function') {
      return await response.text();
    }
    return response.statusText || '';
  } catch {
    return '';
  }
}

/**
 * Build full API URL from base and endpoint
 * @param {string} baseUrl - Base API URL
 * @param {string} endpoint - API endpoint (should start with /)
 * @returns {string} Full URL
 */
export function buildApiUrl(baseUrl, endpoint) {
  // Remove trailing slash from base, ensure endpoint starts with /
  let base = baseUrl.replace(/\/$/, '');
  let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

/**
 * Build endpoint URL with optional query params
 * @param {string} endpoint - Base endpoint
 * @param {Object} params - Query parameters
 * @returns {string} Endpoint with query string
 */
export function buildEndpointWithParams(endpoint, params = {}) {
  let query = buildQueryParams(params);
  if (!query) return endpoint;
  return `${endpoint}?${query}`;
}
