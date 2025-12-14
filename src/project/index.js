/**
 * Project Module - Public exports
 *
 * Provides functional project management primitives:
 * - core.js: Pure functions for validation, URL building, response extraction
 * - operations.js: Project operations with dependency injection
 */

// Core pure functions
export {
  buildBuildsQueryParams,
  buildBuildsUrl,
  buildMappingResult,
  buildNoApiServiceError,
  buildNoAuthError,
  buildOrgHeader,
  buildProjectFetchError,
  buildProjectUrl,
  buildTokenCreateError,
  buildTokenRevokeError,
  buildTokensFetchError,
  buildTokensUrl,
  enrichProjectsWithOrg,
  extractBuilds,
  extractOrganizations,
  extractProject,
  extractProjects,
  extractToken,
  extractTokens,
  mappingsToArray,
  validateDirectory,
  validateProjectData,
} from './core.js';

// Project operations (take dependencies as parameters)
export {
  createMapping,
  createProjectToken,
  getMapping,
  getProject,
  getProjectWithApiToken,
  getProjectWithOAuth,
  getRecentBuilds,
  getRecentBuildsWithApiToken,
  getRecentBuildsWithOAuth,
  listMappings,
  listProjects,
  listProjectsWithApiToken,
  listProjectsWithOAuth,
  listProjectTokens,
  removeMapping,
  revokeProjectToken,
  switchProject,
} from './operations.js';
