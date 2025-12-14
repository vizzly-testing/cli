/**
 * Config Module - Public exports
 *
 * Provides functional configuration primitives:
 * - core.js: Pure functions for merging, serialization, validation results
 * - operations.js: Config operations with dependency injection
 */

// Core pure functions
export {
  buildGlobalConfigResult,
  buildMergedConfig,
  buildMergedConfigResult,
  buildProjectConfigResult,
  buildValidationFailure,
  buildValidationSuccess,
  CONFIG_DEFAULTS,
  deepMerge,
  extractCosmiconfigResult,
  extractEnvOverrides,
  getConfigFormat,
  READ_SCOPES,
  serializeConfig,
  serializeToJavaScript,
  serializeToJson,
  stringifyWithIndent,
  validateReadScope,
  validateWriteScope,
  WRITE_SCOPES,
} from './core.js';

// Config operations (take dependencies as parameters)
export {
  getConfig,
  getConfigSource,
  getGlobalConfig,
  getMergedConfig,
  getProjectConfig,
  updateConfig,
  updateGlobalConfig,
  updateProjectConfig,
  validateConfig,
  writeProjectConfigFile,
} from './operations.js';
