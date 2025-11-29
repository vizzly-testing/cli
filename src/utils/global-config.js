/**
 * Global User Configuration Utilities
 * Manages ~/.vizzly/config.json for storing authentication tokens
 */

import { homedir } from 'os';
import { join, dirname, parse } from 'path';
import { readFile, writeFile, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import * as output from './output.js';

/**
 * Get the path to the global Vizzly directory
 * @returns {string} Path to ~/.vizzly
 */
export function getGlobalConfigDir() {
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
  try {
    let configPath = getGlobalConfigPath();

    if (!existsSync(configPath)) {
      return {};
    }

    let content = await readFile(configPath, 'utf-8');
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
 * Get authentication tokens from global config
 * @returns {Promise<Object|null>} Token object with accessToken, refreshToken, expiresAt, user, or null if not found
 */
export async function getAuthTokens() {
  let config = await loadGlobalConfig();

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

/**
 * Check if authentication tokens exist and are not expired
 * @returns {Promise<boolean>} True if valid tokens exist
 */
export async function hasValidTokens() {
  let auth = await getAuthTokens();

  if (!auth || !auth.accessToken) {
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
 * Get the access token from global config if available
 * @returns {Promise<string|null>} Access token or null
 */
export async function getAccessToken() {
  let auth = await getAuthTokens();
  return auth?.accessToken || null;
}

/**
 * Get project mapping for a directory
 * Walks up the directory tree to find the closest mapping
 * @param {string} directoryPath - Absolute path to project directory
 * @returns {Promise<Object|null>} Project data or null
 */
export async function getProjectMapping(directoryPath) {
  let config = await loadGlobalConfig();
  if (!config.projects) {
    output.debug('[MAPPING] No projects in global config');
    return null;
  }

  // Walk up the directory tree looking for a mapping
  let currentPath = directoryPath;
  let { root } = parse(currentPath);

  output.debug('[MAPPING] Starting lookup', {
    from: currentPath,
    availableMappings: Object.keys(config.projects),
  });

  while (currentPath !== root) {
    output.debug('[MAPPING] Checking', { path: currentPath });

    if (config.projects[currentPath]) {
      output.debug('[MAPPING] Found match', { path: currentPath });
      return config.projects[currentPath];
    }

    // Move to parent directory
    let parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // We've reached the root
      break;
    }
    currentPath = parentPath;
  }

  output.debug('[MAPPING] No mapping found');

  return null;
}

/**
 * Save project mapping for a directory
 * @param {string} directoryPath - Absolute path to project directory
 * @param {Object} projectData - Project configuration
 * @param {string} projectData.token - Project API token (vzt_...)
 * @param {string} projectData.projectSlug - Project slug
 * @param {string} projectData.organizationSlug - Organization slug
 * @param {string} projectData.projectName - Project name
 */
export async function saveProjectMapping(directoryPath, projectData) {
  let config = await loadGlobalConfig();
  if (!config.projects) {
    config.projects = {};
  }
  config.projects[directoryPath] = {
    ...projectData,
    createdAt: new Date().toISOString(),
  };
  await saveGlobalConfig(config);
}

/**
 * Get all project mappings
 * @returns {Promise<Object>} Map of directory paths to project data
 */
export async function getProjectMappings() {
  let config = await loadGlobalConfig();
  return config.projects || {};
}

/**
 * Delete project mapping for a directory
 * @param {string} directoryPath - Absolute path to project directory
 */
export async function deleteProjectMapping(directoryPath) {
  let config = await loadGlobalConfig();
  if (config.projects && config.projects[directoryPath]) {
    delete config.projects[directoryPath];
    await saveGlobalConfig(config);
  }
}
