import { VizzlyError } from '../../errors/vizzly-error.js';

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
