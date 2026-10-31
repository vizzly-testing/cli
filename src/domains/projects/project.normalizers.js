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
