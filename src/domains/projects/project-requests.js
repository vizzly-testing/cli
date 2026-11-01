/**
 * Build query params for builds API request
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Number of builds to fetch
 * @param {string} [options.branch] - Filter by branch
 * @returns {string} Query string (empty string if no params)
 */
export function buildBuildsQueryParams(options = {}) {
  let params = new globalThis.URLSearchParams();

  if (options.limit) {
    params.append('limit', String(options.limit));
  }

  if (options.branch) {
    params.append('branch', options.branch);
  }

  let query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Build organization header object
 * @param {string} organizationSlug - Organization slug
 * @returns {Object} Headers object with X-Organization header
 */
export function buildOrgHeader(organizationSlug) {
  return { 'X-Organization': organizationSlug };
}

/**
 * Build API URL for project endpoint
 * @param {string} projectSlug - Project slug
 * @returns {string} API URL path
 */
export function buildProjectUrl(projectSlug) {
  return `/api/project/${projectSlug}`;
}

/**
 * Build API URL for builds endpoint
 * @param {string} projectSlug - Project slug
 * @param {Object} options - Query options
 * @returns {string} Full API URL path with query params
 */
export function buildBuildsUrl(projectSlug, options = {}) {
  let queryString = buildBuildsQueryParams(options);
  return `/api/build/${projectSlug}${queryString}`;
}

/**
 * Build API URL for project tokens endpoint
 * @param {string} organizationSlug - Organization slug
 * @param {string} projectSlug - Project slug
 * @param {string} [tokenId] - Optional token ID for specific token operations
 * @returns {string} API URL path
 */
export function buildTokensUrl(_organizationSlug, projectSlug, tokenId) {
  let base = `/api/project/${projectSlug}/tokens`;
  return tokenId ? `${base}/${tokenId}` : base;
}
