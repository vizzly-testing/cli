/**
 * Determine if we should skip Vizzly integration entirely
 * @param {Object} options - Options
 * @param {boolean} options.allowNoToken - Whether to allow running without token
 * @param {boolean} options.hasApiKey - Whether an API key is available
 * @param {boolean} options.tdd - Whether in TDD mode
 * @returns {boolean} True if Vizzly should be disabled
 */
export function shouldDisableVizzly({ allowNoToken, hasApiKey, tdd }) {
  return allowNoToken && !hasApiKey && !tdd;
}

/**
 * Determine build mode
 * @param {boolean} tdd - Whether TDD mode is enabled
 * @returns {'tdd'|'api'} Build mode
 */
export function determineBuildMode(tdd) {
  return tdd ? 'tdd' : 'api';
}

/**
 * Validate daemon mode requirements
 * @param {Object} options - Options
 * @param {boolean} options.tdd - Whether TDD mode is enabled
 * @param {boolean} options.daemon - Whether daemon mode is enabled
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDaemonMode({ tdd, daemon }) {
  if (!tdd || !daemon) {
    return {
      valid: false,
      error: 'Initialize method is only for TDD daemon mode',
    };
  }
  return { valid: true, error: null };
}

/**
 * Check if API key is available
 * @param {Object} config - Configuration object
 * @returns {boolean} Whether API key exists
 */
export function hasApiKey(config) {
  return Boolean(config?.apiKey);
}
