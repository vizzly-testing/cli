import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
import { VizzlyError } from '../../errors/vizzly-error.js';
import {
  loadGlobalConfig,
  saveGlobalConfig,
} from '../../services/global-config.js';
import * as output from '../../services/output.js';
import {
  deepMerge,
  extractCosmiconfigResult,
  extractEnvOverrides,
} from './config.normalizers.js';
import { validateReadScope, validateWriteScope } from './config.rules.js';
import {
  buildGlobalConfigResult,
  buildMergedConfigResult,
  buildProjectConfigResult,
  getConfigFormat,
  serializeConfig,
} from './config.serializers.js';
import { CONFIG_DEFAULTS } from './config-defaults.js';

/**
 * Config Operations - Configuration operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - explorer: cosmiconfig explorer for project config
 * - globalConfigStore: for reading/writing global config
 * - fileWriter: for writing project config files
 *
 * This makes them trivially testable without mocking modules.
 */

/**
 * Config Service
 * Manages configuration for the TDD dashboard settings page
 *
 * Provides read/write access to:
 * - Merged config (read-only combination of all sources)
 * - Project config (vizzly.config.js in working directory)
 * - Global config (~/.vizzly/config.json)
 */

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

/**
 * Get project-level config from vizzly.config.js or similar
 * @param {Object} explorer - Cosmiconfig explorer with search method
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<{ config: Object, filepath: string|null, isEmpty: boolean }>}
 */
export async function getProjectConfig(explorer, projectRoot) {
  let result = explorer.search(projectRoot);
  let { config, filepath } = extractCosmiconfigResult(result);
  return buildProjectConfigResult(config, filepath);
}

/**
 * Get global config from ~/.vizzly/config.json
 * @param {Object} globalConfigStore - Store with load and getPath methods
 * @returns {Promise<{ config: Object, filepath: string, isEmpty: boolean }>}
 */
export async function getGlobalConfig(globalConfigStore) {
  let config = await globalConfigStore.load();
  let filepath = globalConfigStore.getPath();
  return buildGlobalConfigResult(config, filepath);
}

/**
 * Get merged config from all sources with source tracking
 * @param {Object} options - Options
 * @param {Object} options.explorer - Cosmiconfig explorer
 * @param {Object} options.globalConfigStore - Global config store
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} [options.env] - Environment variables (defaults to process.env)
 * @returns {Promise<{ config: Object, sources: Object, projectFilepath: string|null, globalFilepath: string }>}
 */
export async function getMergedConfig({
  explorer,
  globalConfigStore,
  projectRoot,
  env = process.env,
}) {
  let projectConfigData = await getProjectConfig(explorer, projectRoot);
  let globalConfigData = await getGlobalConfig(globalConfigStore);
  let envOverrides = extractEnvOverrides(env);

  return buildMergedConfigResult({
    projectConfig: projectConfigData.config,
    globalConfig: globalConfigData.config,
    envOverrides,
    projectFilepath: projectConfigData.filepath,
    globalFilepath: globalConfigData.filepath,
  });
}

/**
 * Get configuration based on scope
 * @param {Object} options - Options
 * @param {string} options.scope - 'project', 'global', or 'merged'
 * @param {Object} options.explorer - Cosmiconfig explorer
 * @param {Object} options.globalConfigStore - Global config store
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} [options.env] - Environment variables
 * @returns {Promise<Object>} Config result based on scope
 */
export async function getConfig({
  scope = 'merged',
  explorer,
  globalConfigStore,
  projectRoot,
  env,
}) {
  let validation = validateReadScope(scope);
  if (!validation.valid) {
    throw validation.error;
  }

  if (scope === 'project') {
    return getProjectConfig(explorer, projectRoot);
  }

  if (scope === 'global') {
    return getGlobalConfig(globalConfigStore);
  }

  return getMergedConfig({ explorer, globalConfigStore, projectRoot, env });
}

/**
 * Update project-level config
 * @param {Object} options - Options
 * @param {Object} options.updates - Config updates to apply
 * @param {Object} options.explorer - Cosmiconfig explorer
 * @param {string} options.projectRoot - Project root directory
 * @param {Function} options.writeFile - Async file writer (path, content) => Promise
 * @param {Function} options.readFile - Async file reader (path) => Promise<string>
 * @param {Function} options.validate - Config validator
 * @returns {Promise<{ config: Object, filepath: string }>}
 */
export async function updateProjectConfig({
  updates,
  explorer,
  projectRoot,
  writeFile,
  readFile,
  validate,
}) {
  let result = explorer.search(projectRoot);
  let { config: currentConfig, filepath: configPath } =
    extractCosmiconfigResult(result);

  // Determine config file path - create new if none exists
  if (!configPath) {
    configPath = join(projectRoot, 'vizzly.config.js');
    currentConfig = {};
  }

  // Merge updates with current config
  let newConfig = deepMerge(currentConfig, updates);

  // Validate before writing
  try {
    validate(newConfig);
  } catch (error) {
    throw new VizzlyError(
      `Invalid configuration: ${error.message}`,
      'CONFIG_VALIDATION_ERROR',
      { errors: error.errors }
    );
  }

  // Write config file based on format
  await writeProjectConfigFile({
    filepath: configPath,
    config: newConfig,
    writeFile,
    readFile,
  });

  // Clear cosmiconfig cache
  explorer.clearCaches();

  return {
    config: newConfig,
    filepath: configPath,
  };
}

/**
 * Write project config to file
 * @param {Object} options - Options
 * @param {string} options.filepath - Path to write to
 * @param {Object} options.config - Config object
 * @param {Function} options.writeFile - Async file writer
 * @param {Function} options.readFile - Async file reader (for package.json)
 * @returns {Promise<void>}
 */
export async function writeProjectConfigFile({
  filepath,
  config,
  writeFile,
  readFile,
}) {
  let format = getConfigFormat(filepath);

  if (format === 'package') {
    // For package.json, merge into existing
    let pkgContent = await readFile(filepath);
    let pkg;
    try {
      pkg = JSON.parse(pkgContent);
    } catch (error) {
      throw new VizzlyError(
        `Failed to parse package.json: ${error.message}`,
        'INVALID_PACKAGE_JSON'
      );
    }
    pkg.vizzly = config;
    await writeFile(filepath, JSON.stringify(pkg, null, 2));
    return;
  }

  let serialized = serializeConfig(config, filepath);

  if (serialized.error) {
    throw serialized.error;
  }

  await writeFile(filepath, serialized.content);
}

/**
 * Update global config
 * @param {Object} options - Options
 * @param {Object} options.updates - Config updates to apply
 * @param {Object} options.globalConfigStore - Global config store with load and save methods
 * @returns {Promise<{ config: Object, filepath: string }>}
 */
export async function updateGlobalConfig({ updates, globalConfigStore }) {
  let currentConfig = await globalConfigStore.load();
  let newConfig = deepMerge(currentConfig, updates);

  await globalConfigStore.save(newConfig);

  return {
    config: newConfig,
    filepath: globalConfigStore.getPath(),
  };
}

/**
 * Update configuration based on scope
 * @param {Object} options - Options
 * @param {string} options.scope - 'project' or 'global'
 * @param {Object} options.updates - Config updates to apply
 * @param {Object} options.explorer - Cosmiconfig explorer
 * @param {Object} options.globalConfigStore - Global config store
 * @param {string} options.projectRoot - Project root directory
 * @param {Function} options.writeFile - Async file writer
 * @param {Function} options.readFile - Async file reader
 * @param {Function} options.validate - Config validator
 * @returns {Promise<{ config: Object, filepath: string }>}
 */
export async function updateConfig({
  scope,
  updates,
  explorer,
  globalConfigStore,
  projectRoot,
  writeFile,
  readFile,
  validate,
}) {
  let validation = validateWriteScope(scope);
  if (!validation.valid) {
    throw validation.error;
  }

  if (scope === 'project') {
    return updateProjectConfig({
      updates,
      explorer,
      projectRoot,
      writeFile,
      readFile,
      validate,
    });
  }

  return updateGlobalConfig({ updates, globalConfigStore });
}

/**
 * Validate configuration object
 * @param {Object} config - Config to validate
 * @param {Function} validateFn - Validation function
 * @returns {{ valid: boolean, config: Object|null, errors: Array }}
 */
export function validateConfig(config, validateFn) {
  try {
    let validated = validateFn(config);
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
 * @param {Object} options - Options
 * @param {string} options.key - Config key to look up
 * @param {Object} options.explorer - Cosmiconfig explorer
 * @param {Object} options.globalConfigStore - Global config store
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} [options.env] - Environment variables
 * @returns {Promise<string>} Source ('default', 'global', 'project', 'env', 'unknown')
 */
export async function getConfigSource({
  key,
  explorer,
  globalConfigStore,
  projectRoot,
  env,
}) {
  let merged = await getMergedConfig({
    explorer,
    globalConfigStore,
    projectRoot,
    env,
  });
  return merged.sources[key] || 'unknown';
}
