/**
 * Token Resolution for MCP Server
 * Resolves API tokens with the same priority as the CLI
 */

import { homedir } from 'os';
import { join, dirname, parse } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * Get the path to the global config file
 */
function getGlobalConfigPath() {
  return join(homedir(), '.vizzly', 'config.json');
}

/**
 * Load the global configuration
 */
async function loadGlobalConfig() {
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
    console.error('Warning: Global config file is corrupted, ignoring');
    return {};
  }
}

/**
 * Get authentication tokens from global config
 */
async function getAuthTokens() {
  let config = await loadGlobalConfig();

  if (!config.auth || !config.auth.accessToken) {
    return null;
  }

  return config.auth;
}

/**
 * Get the access token from global config if available
 */
async function getAccessToken() {
  let auth = await getAuthTokens();
  return auth?.accessToken || null;
}

/**
 * Get project mapping for a directory
 * Walks up the directory tree to find the closest mapping
 */
async function getProjectMapping(directoryPath) {
  let config = await loadGlobalConfig();
  if (!config.projects) {
    return null;
  }

  // Walk up the directory tree looking for a mapping
  let currentPath = directoryPath;
  let { root } = parse(currentPath);

  while (currentPath !== root) {
    if (config.projects[currentPath]) {
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

  return null;
}

/**
 * Resolve token with priority system
 * Priority order:
 * 1. Explicitly provided token parameter
 * 2. Environment variable (VIZZLY_TOKEN)
 * 3. Project mapping for working directory
 * 4. User access token from global config
 *
 * @param {Object} options - Resolution options
 * @param {string} options.providedToken - Explicitly provided token (highest priority)
 * @param {string} options.workingDirectory - Working directory for project mapping lookup
 * @returns {Promise<string|null>} Resolved token or null
 */
export async function resolveToken(options = {}) {
  let { providedToken, workingDirectory } = options;

  // Priority 1: Explicitly provided token
  if (providedToken) {
    return providedToken;
  }

  // Priority 2: Environment variable
  if (process.env.VIZZLY_TOKEN) {
    return process.env.VIZZLY_TOKEN;
  }

  // Priority 3: Project mapping (if working directory provided)
  if (workingDirectory) {
    try {
      let projectMapping = await getProjectMapping(workingDirectory);
      if (projectMapping && projectMapping.token) {
        // Handle both string tokens and token objects
        let token = typeof projectMapping.token === 'string'
          ? projectMapping.token
          : projectMapping.token.token;
        if (token) {
          return token;
        }
      }
    } catch (error) {
      console.error('Warning: Failed to load project mapping:', error.message);
    }
  }

  // Priority 4: User access token
  try {
    let accessToken = await getAccessToken();
    if (accessToken) {
      return accessToken;
    }
  } catch (error) {
    console.error('Warning: Failed to load user access token:', error.message);
  }

  return null;
}

/**
 * Check if the user has valid authentication
 * @returns {Promise<boolean>} True if user has valid, non-expired authentication
 */
export async function hasValidAuth() {
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
 * Get user information from global config
 * @returns {Promise<Object|null>} User object or null if not authenticated
 */
export async function getUserInfo() {
  let auth = await getAuthTokens();
  return auth?.user || null;
}
