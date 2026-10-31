import { CONFIG_DEFAULTS } from './config-defaults.js';

function isPlainConfigObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneConfigValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneConfigValue);
  }

  if (isPlainConfigObject(value)) {
    let cloned = {};
    for (let key of Object.keys(value)) {
      cloned[key] = cloneConfigValue(value[key]);
    }
    return cloned;
  }

  return value;
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object (new object, inputs not mutated)
 */
export function deepMerge(target, source) {
  let output = cloneConfigValue(target);

  for (let key of Object.keys(source)) {
    if (isPlainConfigObject(source[key])) {
      if (isPlainConfigObject(target[key])) {
        output[key] = deepMerge(target[key], source[key]);
      } else {
        output[key] = cloneConfigValue(source[key]);
      }
    } else {
      output[key] = cloneConfigValue(source[key]);
    }
  }

  return output;
}

/**
 * Ensure value is a plain object, return empty object otherwise
 * @param {*} value - Value to check
 * @returns {Object} The value if it's an object, empty object otherwise
 */
function ensureObject(value) {
  if (isPlainConfigObject(value)) {
    return value;
  }
  return {};
}

function applyConfigLayer(config, sources, layer, sourceName) {
  let merged = deepMerge(config, layer);

  for (let key of Object.keys(layer)) {
    sources[key] = sourceName;
  }

  return merged;
}

/**
 * Build merged config from layers with source tracking
 * @param {Object} options - Config layers
 * @param {Object} options.projectConfig - Project config (from vizzly.config.js)
 * @param {Object} options.globalConfig - Global config (from ~/.vizzly/config.json)
 * @param {Object} [options.envOverrides] - Environment variable overrides
 * @returns {{ config: Object, sources: Object }}
 */
export function buildMergedConfig({
  projectConfig = {},
  globalConfig = {},
  envOverrides = {},
} = {}) {
  // Ensure all inputs are plain objects
  let safeProjectConfig = ensureObject(projectConfig);
  let safeGlobalConfig = ensureObject(globalConfig);
  let safeEnvOverrides = ensureObject(envOverrides);

  let mergedConfig = cloneConfigValue(CONFIG_DEFAULTS);
  let sources = {};

  for (let key of Object.keys(CONFIG_DEFAULTS)) {
    sources[key] = 'default';
  }

  mergedConfig = applyConfigLayer(
    mergedConfig,
    sources,
    safeGlobalConfig,
    'global'
  );
  mergedConfig = applyConfigLayer(
    mergedConfig,
    sources,
    safeProjectConfig,
    'project'
  );
  mergedConfig = applyConfigLayer(
    mergedConfig,
    sources,
    safeEnvOverrides,
    'env'
  );

  return { config: mergedConfig, sources };
}

/**
 * Extract environment variable overrides
 * @param {Object} env - Environment variables object (defaults to process.env)
 * @returns {Object} Overrides from environment
 */
export function extractEnvOverrides(env = process.env) {
  let overrides = {};

  if (env.VIZZLY_TOKEN) {
    overrides.apiKey = env.VIZZLY_TOKEN;
  }

  if (env.VIZZLY_API_URL) {
    overrides.apiUrl = env.VIZZLY_API_URL;
  }

  return overrides;
}

/**
 * Extract config from cosmiconfig result (handles .default exports)
 * @param {Object|null} result - Cosmiconfig result
 * @returns {{ config: Object|null, filepath: string|null }}
 */
export function extractCosmiconfigResult(result) {
  if (!result?.config) {
    return { config: null, filepath: null };
  }

  // Handle both `export default` and `module.exports`
  let config = result.config.default || result.config;

  return { config, filepath: result.filepath };
}
