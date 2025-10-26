/**
 * Configuration Service
 * Manages reading and writing Vizzly configuration files
 */

import { BaseService } from './base-service.js';
import { cosmiconfigSync } from 'cosmiconfig';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { VizzlyError } from '../errors/vizzly-error.js';
import { validateVizzlyConfigWithDefaults } from '../utils/config-schema.js';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  getGlobalConfigPath,
} from '../utils/global-config.js';

/**
 * ConfigService for reading and writing configuration
 * @extends BaseService
 */
export class ConfigService extends BaseService {
  constructor(config, options = {}) {
    super(config, options);
    this.projectRoot = options.projectRoot || process.cwd();
    this.explorer = cosmiconfigSync('vizzly');
  }

  /**
   * Get configuration with source information
   * @param {string} scope - 'project', 'global', or 'merged'
   * @returns {Promise<Object>} Config object with metadata
   */
  async getConfig(scope = 'merged') {
    if (scope === 'project') {
      return this._getProjectConfig();
    }

    if (scope === 'global') {
      return this._getGlobalConfig();
    }

    if (scope === 'merged') {
      return this._getMergedConfig();
    }

    throw new VizzlyError(
      `Invalid config scope: ${scope}. Must be 'project', 'global', or 'merged'`,
      'INVALID_CONFIG_SCOPE'
    );
  }

  /**
   * Get project-level config from vizzly.config.js or similar
   * @private
   * @returns {Promise<Object>}
   */
  async _getProjectConfig() {
    let result = this.explorer.search(this.projectRoot);

    if (!result || !result.config) {
      return {
        config: {},
        filepath: null,
        isEmpty: true,
      };
    }

    let config = result.config.default || result.config;

    return {
      config,
      filepath: result.filepath,
      isEmpty: Object.keys(config).length === 0,
    };
  }

  /**
   * Get global config from ~/.vizzly/config.json
   * @private
   * @returns {Promise<Object>}
   */
  async _getGlobalConfig() {
    let globalConfig = await loadGlobalConfig();

    return {
      config: globalConfig,
      filepath: getGlobalConfigPath(),
      isEmpty: Object.keys(globalConfig).length === 0,
    };
  }

  /**
   * Get merged config showing source for each setting
   * @private
   * @returns {Promise<Object>}
   */
  async _getMergedConfig() {
    let projectConfigData = await this._getProjectConfig();
    let globalConfigData = await this._getGlobalConfig();

    // Build config with source tracking
    let mergedConfig = {};
    let sources = {};

    // Layer 1: Defaults
    let defaults = {
      apiUrl: 'https://app.vizzly.dev',
      server: { port: 47392, timeout: 30000 },
      build: { name: 'Build {timestamp}', environment: 'test' },
      upload: {
        screenshotsDir: './screenshots',
        batchSize: 10,
        timeout: 30000,
      },
      comparison: { threshold: 0.1 },
      tdd: { openReport: false },
      plugins: [],
    };

    Object.keys(defaults).forEach(key => {
      mergedConfig[key] = defaults[key];
      sources[key] = 'default';
    });

    // Layer 2: Global config (auth, project mappings, user preferences)
    if (globalConfigData.config.auth) {
      mergedConfig.auth = globalConfigData.config.auth;
      sources.auth = 'global';
    }

    if (globalConfigData.config.projects) {
      mergedConfig.projects = globalConfigData.config.projects;
      sources.projects = 'global';
    }

    // Layer 3: Project config file
    Object.keys(projectConfigData.config).forEach(key => {
      mergedConfig[key] = projectConfigData.config[key];
      sources[key] = 'project';
    });

    // Layer 4: Environment variables (tracked separately)
    let envOverrides = {};
    if (process.env.VIZZLY_TOKEN) {
      envOverrides.apiKey = process.env.VIZZLY_TOKEN;
      sources.apiKey = 'env';
    }
    if (process.env.VIZZLY_API_URL) {
      envOverrides.apiUrl = process.env.VIZZLY_API_URL;
      sources.apiUrl = 'env';
    }

    return {
      config: { ...mergedConfig, ...envOverrides },
      sources,
      projectFilepath: projectConfigData.filepath,
      globalFilepath: globalConfigData.filepath,
    };
  }

  /**
   * Update configuration
   * @param {string} scope - 'project' or 'global'
   * @param {Object} updates - Configuration updates to apply
   * @returns {Promise<Object>} Updated config
   */
  async updateConfig(scope, updates) {
    if (scope === 'project') {
      return this._updateProjectConfig(updates);
    }

    if (scope === 'global') {
      return this._updateGlobalConfig(updates);
    }

    throw new VizzlyError(
      `Invalid config scope for update: ${scope}. Must be 'project' or 'global'`,
      'INVALID_CONFIG_SCOPE'
    );
  }

  /**
   * Update project-level config
   * @private
   * @param {Object} updates - Config updates
   * @returns {Promise<Object>} Updated config
   */
  async _updateProjectConfig(updates) {
    let result = this.explorer.search(this.projectRoot);

    // Determine config file path
    let configPath;
    let currentConfig = {};

    if (result && result.filepath) {
      configPath = result.filepath;
      currentConfig = result.config.default || result.config;
    } else {
      // Create new config file - prefer vizzly.config.js
      configPath = join(this.projectRoot, 'vizzly.config.js');
    }

    // Merge updates with current config
    let newConfig = this._deepMerge(currentConfig, updates);

    // Validate before writing
    try {
      validateVizzlyConfigWithDefaults(newConfig);
    } catch (error) {
      throw new VizzlyError(
        `Invalid configuration: ${error.message}`,
        'CONFIG_VALIDATION_ERROR',
        { errors: error.errors }
      );
    }

    // Write config file
    await this._writeProjectConfigFile(configPath, newConfig);

    // Clear cosmiconfig cache
    this.explorer.clearCaches();

    return {
      config: newConfig,
      filepath: configPath,
    };
  }

  /**
   * Update global config
   * @private
   * @param {Object} updates - Config updates
   * @returns {Promise<Object>} Updated config
   */
  async _updateGlobalConfig(updates) {
    let currentConfig = await loadGlobalConfig();
    let newConfig = this._deepMerge(currentConfig, updates);

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
    // For .js files, export as ES module
    if (filepath.endsWith('.js') || filepath.endsWith('.mjs')) {
      let content = this._serializeToJavaScript(config);
      await writeFile(filepath, content, 'utf-8');
      return;
    }

    // For .json files
    if (filepath.endsWith('.json')) {
      let content = JSON.stringify(config, null, 2);
      await writeFile(filepath, content, 'utf-8');
      return;
    }

    // For package.json, merge into existing
    if (filepath.endsWith('package.json')) {
      let pkgContent = await readFile(filepath, 'utf-8');
      let pkg = JSON.parse(pkgContent);
      pkg.vizzly = config;
      await writeFile(filepath, JSON.stringify(pkg, null, 2), 'utf-8');
      return;
    }

    throw new VizzlyError(
      `Unsupported config file format: ${filepath}`,
      'UNSUPPORTED_CONFIG_FORMAT'
    );
  }

  /**
   * Serialize config object to JavaScript module
   * @private
   * @param {Object} config - Config object
   * @returns {string} JavaScript source code
   */
  _serializeToJavaScript(config) {
    let lines = [
      '/**',
      ' * Vizzly Configuration',
      ' * @see https://docs.vizzly.dev/cli/configuration',
      ' */',
      '',
      "import { defineConfig } from '@vizzly-testing/cli/config';",
      '',
      'export default defineConfig(',
      this._stringifyWithIndent(config, 1),
      ');',
      '',
    ];

    return lines.join('\n');
  }

  /**
   * Stringify object with proper indentation (2 spaces)
   * @private
   * @param {*} value - Value to stringify
   * @param {number} depth - Current depth
   * @returns {string}
   */
  _stringifyWithIndent(value, depth = 0) {
    let indent = '  '.repeat(depth);
    let prevIndent = '  '.repeat(depth - 1);

    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "\\'")}'`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      let items = value.map(
        item => `${indent}${this._stringifyWithIndent(item, depth + 1)}`
      );
      return `[\n${items.join(',\n')}\n${prevIndent}]`;
    }

    if (typeof value === 'object') {
      let keys = Object.keys(value);
      if (keys.length === 0) return '{}';

      let items = keys.map(key => {
        let val = this._stringifyWithIndent(value[key], depth + 1);
        return `${indent}${key}: ${val}`;
      });

      return `{\n${items.join(',\n')}\n${prevIndent}}`;
    }

    return String(value);
  }

  /**
   * Validate configuration object
   * @param {Object} config - Config to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateConfig(config) {
    try {
      let validated = validateVizzlyConfigWithDefaults(config);
      return {
        valid: true,
        config: validated,
        errors: [],
      };
    } catch (error) {
      return {
        valid: false,
        config: null,
        errors: error.errors || [{ message: error.message }],
      };
    }
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

  /**
   * Deep merge two objects
   * @private
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  _deepMerge(target, source) {
    let output = { ...target };

    for (let key in source) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (
          target[key] &&
          typeof target[key] === 'object' &&
          !Array.isArray(target[key])
        ) {
          output[key] = this._deepMerge(target[key], source[key]);
        } else {
          output[key] = source[key];
        }
      } else {
        output[key] = source[key];
      }
    }

    return output;
  }
}
