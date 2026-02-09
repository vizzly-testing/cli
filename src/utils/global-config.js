/**
 * Global User Configuration Utilities
 * Manages ~/.vizzly/config.json for storing authentication tokens
 */

import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as output from './output.js';

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

  const configPath = getGlobalConfigPath();
  const content = JSON.stringify(config, null, 2);

  // Write file with secure permissions (owner read/write only)
  await writeFile(configPath, content, { mode: 0o600 });

  // Ensure permissions are set correctly (in case umask interfered)
  try {
    await chmod(configPath, 0o600);
  } catch (error) {
    // On Windows, chmod may not work as expected, but that's okay
    if (process.platform !== 'win32') {
      throw error;
    }
  }
}

/**
 * Clear all global configuration
 * @returns {Promise<void>}
 */
export async function clearGlobalConfig() {
  await saveGlobalConfig({});
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
 * @returns {Promise<Object|null>} Token object with accessToken, refreshToken, expiresAt, user, or null if not found
 */
export async function getAuthTokens() {
  const config = await loadGlobalConfig();

  if (!config.auth || !config.auth.accessToken) {
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
  const config = await loadGlobalConfig();

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
  const config = await loadGlobalConfig();
  delete config.auth;
  await saveGlobalConfig(config);
}

/**
 * Check if authentication tokens exist and are not expired
 * @returns {Promise<boolean>} True if valid tokens exist
 */
export async function hasValidTokens() {
  const auth = await getAuthTokens();

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
 * @returns {Promise<string|null>} Access token or null
 */
export async function getAccessToken() {
  let valid = await hasValidTokens();
  if (!valid) return null;

  let auth = await getAuthTokens();
  return auth?.accessToken || null;
}
