/**
 * Configuration Service
 * Manages reading and writing Vizzly configuration files
 *
 * This is a thin wrapper around the functional config module for backwards compatibility.
 * For new code, prefer using the functions from src/config/ directly.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { cosmiconfigSync } from 'cosmiconfig';
// Import core functions (pure, no I/O)
import {
  buildGlobalConfigResult,
  buildMergedConfigResult,
  buildProjectConfigResult,
  deepMerge,
  extractCosmiconfigResult,
  extractEnvOverrides,
  serializeConfig,
  stringifyWithIndent,
  validateReadScope,
  validateWriteScope,
} from '../config/core.js';
// Import operations (I/O with dependency injection)
import {
  updateProjectConfig as updateProjectConfigOp,
  validateConfig as validateConfigOp,
  writeProjectConfigFile as writeProjectConfigFileOp,
} from '../config/operations.js';
import { validateVizzlyConfigWithDefaults } from '../utils/config-schema.js';
import {
  getGlobalConfigPath,
  loadGlobalConfig,
  saveGlobalConfig,
} from '../utils/global-config.js';

/**
 * ConfigService for reading and writing configuration
 *
 * @deprecated Use functions from src/config/ directly for new code
 */
export class ConfigService {
  constructor(config, options = {}) {
    this.config = config;
    this.projectRoot = options.projectRoot || process.cwd();
    this.explorer = cosmiconfigSync('vizzly');

    // Create global config store adapter
    this._globalConfigStore = {
      load: loadGlobalConfig,
      save: saveGlobalConfig,
      getPath: getGlobalConfigPath,
    };
  }

  /**
   * Get configuration with source information
   * @param {string} scope - 'project', 'global', or 'merged'
   * @returns {Promise<Object>} Config object with metadata
   */
  async getConfig(scope = 'merged') {
    let validation = validateReadScope(scope);
    if (!validation.valid) {
      throw validation.error;
    }

    if (scope === 'project') {
      return this._getProjectConfig();
    }

    if (scope === 'global') {
      return this._getGlobalConfig();
    }

    return this._getMergedConfig();
  }

  /**
   * Get project-level config from vizzly.config.js or similar
   * @private
   * @returns {Promise<Object>}
   */
  async _getProjectConfig() {
    let result = this.explorer.search(this.projectRoot);
    let { config, filepath } = extractCosmiconfigResult(result);
    return buildProjectConfigResult(config, filepath);
  }

  /**
   * Get global config from ~/.vizzly/config.json
   * @private
   * @returns {Promise<Object>}
   */
  async _getGlobalConfig() {
    let globalConfig = await loadGlobalConfig();
    return buildGlobalConfigResult(globalConfig, getGlobalConfigPath());
  }

  /**
   * Get merged config showing source for each setting
   * @private
   * @returns {Promise<Object>}
   */
  async _getMergedConfig() {
    let projectConfigData = await this._getProjectConfig();
    let globalConfigData = await this._getGlobalConfig();
    let envOverrides = extractEnvOverrides();

    return buildMergedConfigResult({
      projectConfig: projectConfigData.config,
      globalConfig: globalConfigData.config,
      envOverrides,
      projectFilepath: projectConfigData.filepath,
      globalFilepath: globalConfigData.filepath,
    });
  }

  /**
   * Update configuration
   * @param {string} scope - 'project' or 'global'
   * @param {Object} updates - Configuration updates to apply
   * @returns {Promise<Object>} Updated config
   */
  async updateConfig(scope, updates) {
    let validation = validateWriteScope(scope);
    if (!validation.valid) {
      throw validation.error;
    }

    if (scope === 'project') {
      return this._updateProjectConfig(updates);
    }

    return this._updateGlobalConfig(updates);
  }

  /**
   * Update project-level config
   * @private
   * @param {Object} updates - Config updates
   * @returns {Promise<Object>} Updated config
   */
  async _updateProjectConfig(updates) {
    return updateProjectConfigOp({
      updates,
      explorer: this.explorer,
      projectRoot: this.projectRoot,
      writeFile: (path, content) => writeFile(path, content, 'utf-8'),
      readFile: path => readFile(path, 'utf-8'),
      validate: validateVizzlyConfigWithDefaults,
    });
  }

  /**
   * Update global config
   * @private
   * @param {Object} updates - Config updates
   * @returns {Promise<Object>} Updated config
   */
  async _updateGlobalConfig(updates) {
    let currentConfig = await loadGlobalConfig();
    let newConfig = deepMerge(currentConfig, updates);

    await saveGlobalConfig(newConfig);

    return {
      config: newConfig,
      filepath: getGlobalConfigPath(),
    };
  }

  /**
   * Write project config file (JavaScript format)
   * @private
   * @param {string} filepath - Path to write to
   * @param {Object} config - Config object
   * @returns {Promise<void>}
   */
  async _writeProjectConfigFile(filepath, config) {
    return writeProjectConfigFileOp({
      filepath,
      config,
      writeFile: (path, content) => writeFile(path, content, 'utf-8'),
      readFile: path => readFile(path, 'utf-8'),
    });
  }

  /**
   * Validate configuration object
   * @param {Object} config - Config to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateConfig(config) {
    return validateConfigOp(config, validateVizzlyConfigWithDefaults);
  }

  /**
   * Get the source of a specific config key
   * @param {string} key - Config key
   * @returns {Promise<string>} Source ('default', 'global', 'project', 'env', 'cli')
   */
  async getConfigSource(key) {
    let merged = await this._getMergedConfig();
    return merged.sources[key] || 'unknown';
  }

  // ============================================================================
  // Legacy compatibility methods (delegate to core functions)
  // ============================================================================

  /**
   * Deep merge two objects
   * @private
   * @deprecated Use deepMerge from src/config/core.js
   */
  _deepMerge(target, source) {
    return deepMerge(target, source);
  }

  /**
   * Serialize config object to JavaScript module
   * @private
   * @deprecated Use serializeToJavaScript from src/config/core.js
   */
  _serializeToJavaScript(config) {
    let result = serializeConfig(config, 'config.js');
    return result.content;
  }

  /**
   * Stringify object with proper indentation (2 spaces)
   * @private
   * @deprecated Use stringifyWithIndent from src/config/core.js
   */
  _stringifyWithIndent(value, depth = 0) {
    return stringifyWithIndent(value, depth);
  }
}
