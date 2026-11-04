import { AuthError, VizzlyError } from '../../shared/vizzly-error.js';

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

let cliScopes = ['read', 'builds:write', 'reviews:write', 'comments:write'];

export function parseLoginScopes(value) {
  if (value === undefined) return undefined;
  let scopes =
    typeof value === 'string'
      ? [...new Set(value.split(/[\s,]+/).filter(Boolean))]
      : [];
  if (!scopes.length || scopes.some(scope => !cliScopes.includes(scope))) {
    throw new VizzlyError(
      `--scopes must contain one or more of: ${cliScopes.join(', ')}.`,
      'INVALID_SCOPE'
    );
  }
  return scopes.join(' ');
}
