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
