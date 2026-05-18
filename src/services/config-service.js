/**
 * Config Service
 * Manages configuration for the TDD dashboard settings page
 *
 * Provides read/write access to:
 * - Merged config (read-only combination of all sources)
 * - Project config (vizzly.config.js in working directory)
 * - Global config (~/.vizzly/config.json)
 */

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
import { CONFIG_DEFAULTS } from '../config/core.js';
import { loadGlobalConfig, saveGlobalConfig } from '../utils/global-config.js';
import * as output from '../utils/output.js';

/**
 * Create a config service instance
 * @param {Object} options
 * @param {string} options.workingDir - Working directory for project config
 * @returns {Object} Config service with getConfig, updateConfig, validateConfig methods
 */
export function createConfigService({ workingDir }) {
  let projectConfigPath = null;
  let projectConfigFormat = 'js'; // 'js' or 'json'

  // Find project config file
  let explorer = cosmiconfigSync('vizzly');
  let searchResult = explorer.search(workingDir);

  if (searchResult?.filepath) {
    projectConfigPath = searchResult.filepath;
    projectConfigFormat = searchResult.filepath.endsWith('.json')
      ? 'json'
      : 'js';
  }

  /**
   * Get configuration by type
   * @param {'merged'|'project'|'global'} type
   * @returns {Promise<Object>}
   */
  async function getConfig(type) {
    if (type === 'merged') {
      return getMergedConfig();
    } else if (type === 'project') {
      return getProjectConfig();
    } else if (type === 'global') {
      return getGlobalConfigData();
    }
    throw new Error(`Unknown config type: ${type}`);
  }

  /**
   * Get merged configuration with source tracking
   */
  async function getMergedConfig() {
    let config = cloneConfigValue(CONFIG_DEFAULTS);
    let sources = {};

    // Layer 1: Global config
    let globalConfig = await loadGlobalConfig();
    if (globalConfig.settings) {
      mergeWithTracking(config, globalConfig.settings, sources, 'global');
    }

    // Layer 2: Project config
    if (projectConfigPath && existsSync(projectConfigPath)) {
      try {
        let result = explorer.load(projectConfigPath);
        let projectConfig = result?.config?.default || result?.config || {};
        mergeWithTracking(config, projectConfig, sources, 'project');
      } catch (error) {
        output.debug(
          'config-service',
          `Error loading project config: ${error.message}`
        );
      }
    }

    // Layer 3: Environment variables
    if (process.env.VIZZLY_THRESHOLD) {
      config.comparison.threshold = Number(process.env.VIZZLY_THRESHOLD);
      sources.comparison = 'env';
    }
    if (process.env.VIZZLY_MIN_CLUSTER_SIZE) {
      config.comparison.minClusterSize = Number(
        process.env.VIZZLY_MIN_CLUSTER_SIZE
      );
      sources.comparison = 'env';
    }
    if (process.env.VIZZLY_PORT) {
      config.server.port = Number(process.env.VIZZLY_PORT);
      sources.server = 'env';
    }

    return { config, sources };
  }

  /**
   * Get project-level configuration only
   */
  async function getProjectConfig() {
    if (!projectConfigPath || !existsSync(projectConfigPath)) {
      return { config: {}, path: null };
    }

    try {
      let result = explorer.load(projectConfigPath);
      let config = result?.config?.default || result?.config || {};
      return { config, path: projectConfigPath };
    } catch (error) {
      output.debug(
        'config-service',
        `Error loading project config: ${error.message}`
      );
      return { config: {}, path: projectConfigPath, error: error.message };
    }
  }

  /**
   * Get global configuration only
   */
  async function getGlobalConfigData() {
    let globalConfig = await loadGlobalConfig();
    return {
      config: globalConfig.settings || {},
      path: join(
        process.env.VIZZLY_HOME || join(process.env.HOME || '', '.vizzly'),
        'config.json'
      ),
    };
  }

  /**
   * Update configuration by type
   * @param {'project'|'global'} type
   * @param {Object} updates - Config updates to apply
   * @returns {Promise<Object>}
   */
  async function updateConfig(type, updates) {
    if (type === 'project') {
      return updateProjectConfig(updates);
    } else if (type === 'global') {
      return updateGlobalConfig(updates);
    }
    throw new Error(`Cannot update config type: ${type}`);
  }

  /**
   * Update project configuration (vizzly.config.js)
   */
  async function updateProjectConfig(updates) {
    // If no project config exists, create one
    if (!projectConfigPath) {
      projectConfigPath = join(workingDir, 'vizzly.config.js');
      projectConfigFormat = 'js';
    }

    // Read existing config
    let existingConfig = {};
    if (existsSync(projectConfigPath)) {
      try {
        let result = explorer.load(projectConfigPath);
        existingConfig = result?.config?.default || result?.config || {};
      } catch {
        // Start fresh if corrupted
      }
    }

    // Merge updates
    let newConfig = mergeDeep(existingConfig, updates);

    // Write based on format
    if (projectConfigFormat === 'json') {
      await writeFile(projectConfigPath, JSON.stringify(newConfig, null, 2));
    } else {
      // Write as ES module
      let content = `import { defineConfig } from '@vizzly-testing/cli/config';

export default defineConfig(${JSON.stringify(newConfig, null, 2)});
`;
      await writeFile(projectConfigPath, content);
    }

    // Clear cosmiconfig cache so next read gets fresh data
    explorer.clearCaches();

    return { success: true, path: projectConfigPath };
  }

  /**
   * Update global configuration (~/.vizzly/config.json)
   */
  async function updateGlobalConfig(updates) {
    let globalConfig = await loadGlobalConfig();

    if (!globalConfig.settings) {
      globalConfig.settings = {};
    }

    globalConfig.settings = mergeDeep(globalConfig.settings, updates);
    await saveGlobalConfig(globalConfig);

    return { success: true };
  }

  /**
   * Validate configuration
   * @param {Object} config - Config to validate
   * @returns {Promise<Object>}
   */
  async function validateConfig(config) {
    let errors = [];
    let warnings = [];

    // Validate threshold
    if (config.comparison?.threshold !== undefined) {
      let threshold = config.comparison.threshold;
      if (
        typeof threshold !== 'number' ||
        !Number.isFinite(threshold) ||
        threshold < 0
      ) {
        errors.push('comparison.threshold must be a non-negative number');
      } else if (threshold > 100) {
        warnings.push(
          'comparison.threshold above 100 may cause all comparisons to pass'
        );
      }
    }

    // Validate minClusterSize
    if (config.comparison?.minClusterSize !== undefined) {
      let minClusterSize = config.comparison.minClusterSize;
      if (!Number.isInteger(minClusterSize) || minClusterSize < 1) {
        errors.push(
          'comparison.minClusterSize must be a positive integer (1 or greater)'
        );
      } else if (minClusterSize > 100) {
        warnings.push(
          'comparison.minClusterSize above 100 may filter out most differences'
        );
      }
    }

    // Validate port
    if (config.server?.port !== undefined) {
      let port = config.server.port;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push('server.port must be an integer between 1 and 65535');
      } else if (port < 1024) {
        warnings.push('server.port below 1024 may require elevated privileges');
      }
    }

    // Validate timeout
    if (config.server?.timeout !== undefined) {
      let timeout = config.server.timeout;
      if (!Number.isInteger(timeout) || timeout < 0) {
        errors.push('server.timeout must be a non-negative integer');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  return {
    getConfig,
    updateConfig,
    validateConfig,
  };
}

/**
 * Deep merge two objects
 */
function mergeDeep(target, source) {
  let result = cloneConfigValue(target);

  for (let key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = mergeDeep(result[key] || {}, source[key]);
    } else if (Array.isArray(source[key])) {
      result[key] = [...source[key]];
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

function cloneConfigValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneConfigValue);
  }

  if (value && typeof value === 'object') {
    let clone = {};
    for (let key in value) {
      clone[key] = cloneConfigValue(value[key]);
    }
    return clone;
  }

  return value;
}

/**
 * Merge config with source tracking
 */
function mergeWithTracking(target, source, sources, sourceName, sectionName) {
  for (let key in source) {
    let sourceSection = sectionName || key;

    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      mergeWithTracking(
        target[key],
        source[key],
        sources,
        sourceName,
        sourceSection
      );
    } else {
      target[key] = source[key];
      sources[sourceSection] = sourceName;
    }
  }
}
