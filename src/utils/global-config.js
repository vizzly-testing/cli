/**
 * Global User Configuration Utilities
 * Manages ~/.vizzly/config.json for storing authentication tokens
 */

import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  getCredentialState,
  migrateCredentialState,
  resolveEnvironment,
  setCredentialState,
} from './environment-profile.js';
import * as output from './output.js';

export function expandHomePath(path) {
  if (!path) {
    return path;
  }

  let home = homedir();

  if (path === '$HOME') {
    return home;
  }

  if (path.startsWith('$HOME/')) {
    return join(home, path.slice('$HOME/'.length));
  }

  if (path === '~') {
    return home;
  }

  if (path.startsWith('~/')) {
    return join(home, path.slice(2));
  }

  return path;
}

/**
 * Get the path to the global Vizzly directory
 * @returns {string} Path to VIZZLY_HOME or ~/.vizzly
 */
export function getGlobalConfigDir() {
  if (process.env.VIZZLY_HOME) {
    return expandHomePath(process.env.VIZZLY_HOME);
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
  let dir = getGlobalConfigDir();

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load the global configuration
 * @returns {Promise<Object>} Global config object
 */
export async function loadGlobalConfig() {
  let parsedConfig;

  try {
    let configPath = getGlobalConfigPath();

    if (!existsSync(configPath)) {
      return {};
    }

    let content = await readFile(configPath, 'utf-8');
    parsedConfig = JSON.parse(content);
  } catch (error) {
    // If file doesn't exist or is corrupted, return empty config
    if (error.code === 'ENOENT') {
      return {};
    }

    // Log warning about corrupted config but don't crash
    output.warn('Global config file is corrupted, ignoring');
    return {};
  }

  let migration = migrateCredentialState(parsedConfig);
  if (migration.changed) {
    await saveGlobalConfig(migration.config);
  }

  return migration.config;
}

/**
 * Read environment selection synchronously for commands created before config
 * services are available.
 *
 * Corrupt state fails loudly so the CLI cannot silently fall back to
 * production and select production credentials.
 *
 * @returns {Object} Parsed global configuration.
 */
export function loadGlobalConfigSync() {
  try {
    let configPath = getGlobalConfigPath();
    if (!existsSync(configPath)) {
      return {};
    }

    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw new Error('Global Vizzly config is corrupted', { cause: error });
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
 * This auto-configures the menubar app so it can find package runners/node
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
export async function getAuthTokens(options = {}) {
  let config = await loadGlobalConfig();
  let environment = resolveEnvironment({
    config,
    env: options.env,
    apiUrl: options.apiUrl,
  });
  let credentials = getCredentialState(config, environment.origin);

  if (!credentials.auth?.accessToken) {
    return null;
  }

  return credentials.auth;
}

/**
 * Save authentication tokens to global config
 * @param {Object} auth - Auth object with accessToken, refreshToken, expiresAt, user
 * @returns {Promise<void>}
 */
export async function saveAuthTokens(auth, options = {}) {
  let config = await loadGlobalConfig();
  let environment = resolveEnvironment({
    config,
    env: options.env,
    apiUrl: options.apiUrl,
  });
  let credentials = getCredentialState(config, environment.origin);
  let nextConfig = setCredentialState(config, environment.origin, {
    ...credentials,
    auth: {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
      user: auth.user,
    },
  });

  await saveGlobalConfig(nextConfig);
}

/**
 * Clear authentication tokens from global config
 * @returns {Promise<void>}
 */
export async function clearAuthTokens(options = {}) {
  let config = await loadGlobalConfig();
  let environment = resolveEnvironment({
    config,
    env: options.env,
    apiUrl: options.apiUrl,
  });
  let credentials = getCredentialState(config, environment.origin);
  let nextCredentials = { ...credentials };
  delete nextCredentials.auth;
  let nextConfig = setCredentialState(
    config,
    environment.origin,
    nextCredentials
  );
  await saveGlobalConfig(nextConfig);
}

/**
 * Check if authentication tokens exist and are not expired
 * @returns {Promise<boolean>} True if valid tokens exist
 */
export async function hasValidTokens(options = {}) {
  let auth = await getAuthTokens(options);

  if (!auth?.accessToken) {
    return false;
  }

  // Check if token is expired
  if (auth.expiresAt) {
    let expiresAt = new Date(auth.expiresAt);
    let now = new Date();

    // Consider expired if within 5 minutes of expiry
    let bufferMs = 5 * 60 * 1000;
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
export async function getAccessToken(options = {}) {
  let valid = await hasValidTokens(options);
  if (!valid) return null;

  let auth = await getAuthTokens(options);
  return auth?.accessToken || null;
}
