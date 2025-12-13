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

import { join } from 'node:path';
import { VizzlyError } from '../errors/vizzly-error.js';
import {
  buildGlobalConfigResult,
  buildMergedConfigResult,
  buildProjectConfigResult,
  deepMerge,
  extractCosmiconfigResult,
  extractEnvOverrides,
  getConfigFormat,
  serializeConfig,
  validateReadScope,
  validateWriteScope,
} from './core.js';

// ============================================================================
// Read Operations
// ============================================================================

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

// ============================================================================
// Write Operations
// ============================================================================

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

// ============================================================================
// Validation Operations
// ============================================================================

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

// ============================================================================
// Source Lookup
// ============================================================================

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
