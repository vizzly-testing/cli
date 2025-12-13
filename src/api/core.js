/**
 * API Core - Pure functions for building requests and parsing responses
 *
 * These functions have no side effects and are trivially testable.
 * They handle header construction, payload building, error parsing, and SHA computation.
 */

import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';

// ============================================================================
// Header Building
// ============================================================================

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
 * @returns {string} Complete User-Agent string
 */
export function buildUserAgent(version, command, sdkUserAgent = null) {
  let baseUserAgent = `vizzly-cli/${version} (${command})`;
  if (sdkUserAgent) {
    return `${baseUserAgent} ${sdkUserAgent}`;
  }
  return baseUserAgent;
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

// ============================================================================
// Payload Construction
// ============================================================================

/**
 * Build payload for screenshot upload
 * @param {string} name - Screenshot name
 * @param {Buffer} buffer - Image data
 * @param {Object} metadata - Screenshot metadata (viewport, browser, etc.)
 * @param {string|null} sha256 - Pre-computed SHA256 hash (optional)
 * @returns {Object} Screenshot upload payload
 */
export function buildScreenshotPayload(
  name,
  buffer,
  metadata = {},
  sha256 = null
) {
  let payload = {
    name,
    image_data: buffer.toString('base64'),
    properties: metadata ?? {},
  };

  if (sha256) {
    payload.sha256 = sha256;
  }

  return payload;
}

/**
 * Build payload for build creation
 * @param {Object} options - Build options
 * @returns {Object} Build creation payload
 */
export function buildBuildPayload(options) {
  let payload = {
    name: options.name || options.buildName,
    branch: options.branch,
    environment: options.environment,
  };

  if (options.commit || options.commit_sha) {
    payload.commit_sha = options.commit || options.commit_sha;
  }

  if (options.message || options.commit_message) {
    payload.commit_message = options.message || options.commit_message;
  }

  if (options.pullRequestNumber || options.github_pull_request_number) {
    payload.github_pull_request_number =
      options.pullRequestNumber || options.github_pull_request_number;
  }

  if (options.parallelId || options.parallel_id) {
    payload.parallel_id = options.parallelId || options.parallel_id;
  }

  if (options.threshold != null) {
    payload.threshold = options.threshold;
  }

  if (options.metadata) {
    payload.metadata = options.metadata;
  }

  return payload;
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
 * Build payload for SHA existence check (signature-based format)
 * @param {Array<Object>} screenshots - Screenshots with sha256 and metadata
 * @param {string} buildId - Build ID for screenshot record creation
 * @returns {Object} SHA check request payload
 */
export function buildShaCheckPayload(screenshots, buildId) {
  // Check if using new signature-based format or legacy SHA-only format
  if (
    screenshots.length > 0 &&
    typeof screenshots[0] === 'object' &&
    screenshots[0].sha256
  ) {
    return {
      buildId,
      screenshots,
    };
  }

  // Legacy format: array of SHA strings
  return {
    shas: screenshots,
    buildId,
  };
}

/**
 * Build screenshot object for SHA checking
 * @param {string} sha256 - SHA256 hash of image
 * @param {string} name - Screenshot name
 * @param {Object} metadata - Screenshot metadata
 * @returns {Object} Screenshot check object
 */
export function buildScreenshotCheckObject(sha256, name, metadata = {}) {
  let meta = metadata || {};
  return {
    sha256,
    name,
    browser: meta.browser || 'chrome',
    viewport_width: meta.viewport?.width || meta.viewport_width || 1920,
    viewport_height: meta.viewport?.height || meta.viewport_height || 1080,
  };
}

// ============================================================================
// Response/Error Parsing
// ============================================================================

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
 * Determine if request should retry with token refresh
 * @param {number} status - HTTP status code
 * @param {boolean} isRetry - Whether this is already a retry
 * @param {boolean} hasRefreshToken - Whether refresh token is available
 * @returns {boolean} True if should attempt refresh
 */
export function shouldRetryWithRefresh(status, isRetry, hasRefreshToken) {
  return status === 401 && !isRetry && hasRefreshToken;
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

  if (body) {
    message += ` - ${body}`;
  }

  message += ` (URL: ${url})`;

  let code = 'API_ERROR';
  if (status === 401) code = 'AUTH_ERROR';
  if (status === 403) code = 'FORBIDDEN';
  if (status === 404) code = 'NOT_FOUND';
  if (status === 429) code = 'RATE_LIMITED';
  if (status >= 500) code = 'SERVER_ERROR';

  return { message, code, status };
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

// ============================================================================
// SHA/Hash Computation
// ============================================================================

/**
 * Compute SHA256 hash of buffer
 * @param {Buffer} buffer - Data to hash
 * @returns {string} Hex-encoded SHA256 hash
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ============================================================================
// Deduplication Helpers
// ============================================================================

/**
 * Partition screenshots by SHA existence
 * @param {Array<Object>} screenshots - Screenshots with sha256 property
 * @param {Set<string>|Array<string>} existingShas - SHAs that already exist
 * @returns {Object} { toUpload, existing } partitioned arrays
 */
export function partitionByShaExistence(screenshots, existingShas) {
  let existingSet =
    existingShas instanceof Set ? existingShas : new Set(existingShas);

  let toUpload = [];
  let existing = [];

  for (let screenshot of screenshots) {
    if (existingSet.has(screenshot.sha256)) {
      existing.push(screenshot);
    } else {
      toUpload.push(screenshot);
    }
  }

  return { toUpload, existing };
}

/**
 * Check if SHA check result indicates file exists
 * @param {Object} checkResult - Result from checkShas endpoint
 * @param {string} sha256 - SHA to check
 * @returns {boolean} True if file exists
 */
export function shaExists(checkResult, sha256) {
  return checkResult?.existing?.includes(sha256) ?? false;
}

/**
 * Find screenshot record from SHA check result
 * @param {Object} checkResult - Result from checkShas endpoint
 * @param {string} sha256 - SHA to find
 * @returns {Object|null} Screenshot record or null
 */
export function findScreenshotBySha(checkResult, sha256) {
  return checkResult?.screenshots?.find(s => s.sha256 === sha256) ?? null;
}

// ============================================================================
// URL Building
// ============================================================================

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
