import { VizzlyError } from '../../errors/vizzly-error.js';

/**
 * Valid config scopes for reading
 */
export let READ_SCOPES = ['project', 'global', 'merged'];

/**
 * Valid config scopes for writing
 */
export let WRITE_SCOPES = ['project', 'global'];

/**
 * Validate that a scope is valid for reading
 * @param {string} scope - Scope to validate
 * @returns {{ valid: boolean, error: Error|null }}
 */
export function validateReadScope(scope) {
  if (!READ_SCOPES.includes(scope)) {
    return {
      valid: false,
      error: new VizzlyError(
        `Invalid config scope: ${scope}. Must be 'project', 'global', or 'merged'`,
        'INVALID_CONFIG_SCOPE'
      ),
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate that a scope is valid for writing
 * @param {string} scope - Scope to validate
 * @returns {{ valid: boolean, error: Error|null }}
 */
export function validateWriteScope(scope) {
  if (!WRITE_SCOPES.includes(scope)) {
    return {
      valid: false,
      error: new VizzlyError(
        `Invalid config scope for update: ${scope}. Must be 'project' or 'global'`,
        'INVALID_CONFIG_SCOPE'
      ),
    };
  }
  return { valid: true, error: null };
}
