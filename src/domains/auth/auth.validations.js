import { AuthError } from '../../errors/vizzly-error.js';

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
