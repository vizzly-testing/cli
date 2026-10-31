import {
  loadGlobalConfig,
  saveGlobalConfig,
} from '../../services/global-config.js';

/**
 * Get authentication tokens from global config
 * @returns {Promise<Object|null>} Token object with accessToken, refreshToken, expiresAt, user, or null if not found
 */
export async function getAuthTokens() {
  let config = await loadGlobalConfig();

  if (!config.auth?.accessToken) {
    return null;
  }

  return config.auth;
}

/**
 * Save authentication tokens to global config
 * @param {Object} auth - Auth object with accessToken, refreshToken, expiresAt, user
 * @returns {Promise<void>}
 */
export async function saveAuthTokens(auth) {
  let config = await loadGlobalConfig();

  config.auth = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: auth.expiresAt,
    user: auth.user,
  };

  await saveGlobalConfig(config);
}

/**
 * Clear authentication tokens from global config
 * @returns {Promise<void>}
 */
export async function clearAuthTokens() {
  let config = await loadGlobalConfig();
  delete config.auth;
  await saveGlobalConfig(config);
}

function hasValidAccessToken(auth, now = Date.now()) {
  if (!auth?.accessToken) {
    return false;
  }

  if (!auth.expiresAt) {
    return true;
  }

  let expiresAt = new Date(auth.expiresAt).getTime();
  // Treat tokens expiring within five minutes as unavailable.
  let bufferMs = 5 * 60 * 1000;
  return now < expiresAt - bufferMs;
}

/**
 * Check if authentication tokens exist and are not expired
 * @returns {Promise<boolean>} True if valid tokens exist
 */
export async function hasValidTokens() {
  let auth = await getAuthTokens();
  return hasValidAccessToken(auth);
}

/**
 * Get the access token from global config if valid and not expired
 * @returns {Promise<string|null>} Access token or null
 */
export async function getAccessToken() {
  let auth = await getAuthTokens();
  return hasValidAccessToken(auth) ? auth.accessToken : null;
}

/**
 * Create a token store adapter from global-config functions
 * Used by auth operations that need tokenStore parameter
 */
export function createTokenStore() {
  return {
    getTokens: getAuthTokens,
    saveTokens: saveAuthTokens,
    clearTokens: clearAuthTokens,
  };
}
