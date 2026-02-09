/**
 * Project Core - Pure functions for project logic
 *
 * No I/O, no side effects - just data transformations.
 */

import { VizzlyError } from '../errors/vizzly-error.js';

// ============================================================================
// API Request Helpers
// ============================================================================

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
export function buildTokensUrl(organizationSlug, projectSlug, tokenId) {
  let base = `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}/tokens`;
  return tokenId ? `${base}/${tokenId}` : base;
}

// ============================================================================
// Response Extraction
// ============================================================================

/**
 * Extract projects from API response
 * @param {Object} response - API response
 * @returns {Array} Array of projects
 */
export function extractProjects(response) {
  return response?.projects || [];
}

/**
 * Extract project from API response
 * @param {Object} response - API response
 * @returns {Object} Project object
 */
export function extractProject(response) {
  return response?.project || response;
}

/**
 * Extract builds from API response
 * @param {Object} response - API response
 * @returns {Array} Array of builds
 */
export function extractBuilds(response) {
  return response?.builds || [];
}

/**
 * Extract token from API response
 * @param {Object} response - API response
 * @returns {Object} Token object
 */
export function extractToken(response) {
  return response?.token;
}

/**
 * Extract tokens from API response
 * @param {Object} response - API response
 * @returns {Array} Array of tokens
 */
export function extractTokens(response) {
  return response?.tokens || [];
}

/**
 * Enrich projects with organization info
 * @param {Array} projects - Array of projects
 * @param {Object} org - Organization object
 * @param {string} org.slug - Organization slug
 * @param {string} org.name - Organization name
 * @returns {Array} Projects with organization info added
 */
export function enrichProjectsWithOrg(projects, org) {
  return projects.map(project => ({
    ...project,
    organizationSlug: org.slug,
    organizationName: org.name,
  }));
}

/**
 * Extract organizations from whoami response
 * @param {Object} whoamiResponse - Whoami API response
 * @returns {Array} Array of organizations
 */
export function extractOrganizations(whoamiResponse) {
  return whoamiResponse?.organizations || [];
}

// ============================================================================
// Error Building
// ============================================================================

/**
 * Build error for project fetch failure
 * @param {Error} originalError - Original error
 * @returns {VizzlyError} Wrapped error
 */
export function buildProjectFetchError(originalError) {
  return new VizzlyError(
    `Failed to fetch project: ${originalError.message}`,
    'PROJECT_FETCH_FAILED',
    { originalError }
  );
}

/**
 * Build error for no authentication available
 * @returns {VizzlyError} No auth error
 */
export function buildNoAuthError() {
  return new VizzlyError('No authentication available', 'NO_AUTH_SERVICE');
}

/**
 * Build error for no API service available
 * @returns {VizzlyError} No API service error
 */
export function buildNoApiServiceError() {
  return new VizzlyError('API service not available', 'NO_API_SERVICE');
}

/**
 * Build error for token creation failure
 * @param {Error} originalError - Original error
 * @returns {VizzlyError} Wrapped error
 */
export function buildTokenCreateError(originalError) {
  return new VizzlyError(
    `Failed to create project token: ${originalError.message}`,
    'TOKEN_CREATE_FAILED',
    { originalError }
  );
}

/**
 * Build error for token fetch failure
 * @param {Error} originalError - Original error
 * @returns {VizzlyError} Wrapped error
 */
export function buildTokensFetchError(originalError) {
  return new VizzlyError(
    `Failed to fetch project tokens: ${originalError.message}`,
    'TOKENS_FETCH_FAILED',
    { originalError }
  );
}

/**
 * Build error for token revoke failure
 * @param {Error} originalError - Original error
 * @returns {VizzlyError} Wrapped error
 */
export function buildTokenRevokeError(originalError) {
  return new VizzlyError(
    `Failed to revoke project token: ${originalError.message}`,
    'TOKEN_REVOKE_FAILED',
    { originalError }
  );
}
