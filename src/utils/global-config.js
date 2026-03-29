/**
 * Global User Configuration Utilities
 * Manages ~/.vizzly/config.json for storing authentication tokens
 */

import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as output from './output.js';

let DEFAULT_AUTH_API_URL = 'https://app.vizzly.dev';

/**
 * Get the path to the global Vizzly directory
 * @returns {string} Path to VIZZLY_HOME or ~/.vizzly
 */
export function getGlobalConfigDir() {
  if (process.env.VIZZLY_HOME) {
    return process.env.VIZZLY_HOME;
  }
  return join(homedir(), '.vizzly');
}

/**
 * Get the path to the global config file
 * @returns {string} Path to ~/.vizzly/config.json
 */
export function getGlobalConfigPath() {
  return join(getGlobalConfigDir(), 'config.json');
}

/**
 * Ensure the global config directory exists with proper permissions
 * @returns {Promise<void>}
 */
async function ensureGlobalConfigDir() {
  const dir = getGlobalConfigDir();

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load the global configuration
 * @returns {Promise<Object>} Global config object
 */
export async function loadGlobalConfig() {
  try {
    const configPath = getGlobalConfigPath();

    if (!existsSync(configPath)) {
      return {};
    }

    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // If file doesn't exist or is corrupted, return empty config
    if (error.code === 'ENOENT') {
      return {};
    }

    // Log warning about corrupted config but don't crash
    output.warn('Global config file is corrupted, ignoring');
    return {};
  }
}

/**
 * Save the global configuration
 * @param {Object} config - Configuration object to save
 * @returns {Promise<void>}
 */
export async function saveGlobalConfig(config) {
  await ensureGlobalConfigDir();

  let configPath = getGlobalConfigPath();
  let content = JSON.stringify(config, null, 2);
  let tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;

  // Write atomically so concurrent readers never observe a truncated file.
  await writeFile(tempPath, content, { mode: 0o600 });

  // Ensure permissions are set correctly (in case umask interfered)
  try {
    await chmod(tempPath, 0o600);
  } catch (error) {
    // On Windows, chmod may not work as expected, but that's okay
    if (process.platform !== 'win32') {
      throw error;
    }
  }

  await rename(tempPath, configPath);
}

/**
 * Clear all global configuration
 * @returns {Promise<void>}
 */
export async function clearGlobalConfig() {
  await saveGlobalConfig({});
}

export function normalizeApiUrl(apiUrl = DEFAULT_AUTH_API_URL) {
  let parsedUrl = new URL(apiUrl || DEFAULT_AUTH_API_URL);
  let pathname = parsedUrl.pathname.replace(/\/+$/, '');

  if (pathname === '/') {
    pathname = '';
  }

  return `${parsedUrl.origin}${pathname}`;
}

function migrateLegacyAuthConfig(config) {
  let migratedConfig = { ...config };
  let defaultApiUrl = normalizeApiUrl(DEFAULT_AUTH_API_URL);

  if (migratedConfig.auth?.accessToken) {
    migratedConfig.authByApiUrl = {
      ...(migratedConfig.authByApiUrl || {}),
    };

    if (!migratedConfig.authByApiUrl[defaultApiUrl]) {
      migratedConfig.authByApiUrl[defaultApiUrl] = migratedConfig.auth;
    }
  }

  delete migratedConfig.auth;

  return migratedConfig;
}

async function loadMigratedGlobalConfig(persist = false) {
  let config = await loadGlobalConfig();
  let migratedConfig = migrateLegacyAuthConfig(config);

  if (persist && JSON.stringify(migratedConfig) !== JSON.stringify(config)) {
    await saveGlobalConfig(migratedConfig);
  }

  return migratedConfig;
}

/**
 * Save user's PATH for menubar app to use
 * This auto-configures the menubar app so it can find npx/node
 * @returns {Promise<void>}
 */
export async function saveUserPath() {
  let config = await loadGlobalConfig();
  let userPath = process.env.PATH;

  // Only update if PATH has changed
  if (config.userPath === userPath) {
    return;
  }

  config.userPath = userPath;
  await saveGlobalConfig(config);
}

/**
 * Get stored user PATH for external tools (like menubar app)
 * @returns {Promise<string|null>} PATH string or null if not configured
 */
export async function getUserPath() {
  let config = await loadGlobalConfig();
  return config.userPath || null;
}

/**
 * Get authentication tokens from global config
 * @param {string} [apiUrl] - API URL scope (defaults to cloud)
 * @returns {Promise<Object|null>} Token object with accessToken, refreshToken, expiresAt, user, or null if not found
 */
export async function getAuthTokens(apiUrl = DEFAULT_AUTH_API_URL) {
  let config = await loadMigratedGlobalConfig(true);
  let normalizedApiUrl = normalizeApiUrl(apiUrl);
  let auth = config.authByApiUrl?.[normalizedApiUrl];

  if (!auth || !auth.accessToken) {
    return null;
  }

  return auth;
}

/**
 * Save authentication tokens to global config
 * @param {Object} auth - Auth object with accessToken, refreshToken, expiresAt, user
 * @param {string} [apiUrl] - API URL scope (defaults to cloud)
 * @returns {Promise<void>}
 */
export async function saveAuthTokens(auth, apiUrl = DEFAULT_AUTH_API_URL) {
  let config = await loadMigratedGlobalConfig();
  let normalizedApiUrl = normalizeApiUrl(apiUrl);

  config.authByApiUrl = {
    ...(config.authByApiUrl || {}),
    [normalizedApiUrl]: {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
      user: auth.user,
    },
  };

  await saveGlobalConfig(config);
}

/**
 * Clear authentication tokens from global config
 * @param {string} [apiUrl] - API URL scope (defaults to cloud)
 * @returns {Promise<void>}
 */
export async function clearAuthTokens(apiUrl = DEFAULT_AUTH_API_URL) {
  let config = await loadMigratedGlobalConfig();
  let normalizedApiUrl = normalizeApiUrl(apiUrl);

  if (config.authByApiUrl) {
    delete config.authByApiUrl[normalizedApiUrl];

    if (Object.keys(config.authByApiUrl).length === 0) {
      delete config.authByApiUrl;
    }
  }

  await saveGlobalConfig(config);
}

/**
 * Check if authentication tokens exist and are not expired
 * @param {string} [apiUrl] - API URL scope (defaults to cloud)
 * @returns {Promise<boolean>} True if valid tokens exist
 */
export async function hasValidTokens(apiUrl = DEFAULT_AUTH_API_URL) {
  let auth = await getAuthTokens(apiUrl);

  if (!auth || !auth.accessToken) {
    return false;
  }

  // Check if token is expired
  if (auth.expiresAt) {
    const expiresAt = new Date(auth.expiresAt);
    const now = new Date();

    // Consider expired if within 5 minutes of expiry
    const bufferMs = 5 * 60 * 1000;
    if (now.getTime() >= expiresAt.getTime() - bufferMs) {
      return false;
    }
  }

  return true;
}

/**
 * Get the access token from global config if valid and not expired
 * @param {string} [apiUrl] - API URL scope (defaults to cloud)
 * @returns {Promise<string|null>} Access token or null
 */
export async function getAccessToken(apiUrl = DEFAULT_AUTH_API_URL) {
  let valid = await hasValidTokens(apiUrl);
  if (!valid) return null;

  let auth = await getAuthTokens(apiUrl);
  return auth?.accessToken || null;
}
