/**
 * Config Core - Pure functions for configuration logic
 *
 * No I/O, no side effects - just data transformations.
 */

import { VizzlyError } from '../errors/vizzly-error.js';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values
 */
export const CONFIG_DEFAULTS = {
  apiUrl: 'https://app.vizzly.dev',
  server: { port: 47392, timeout: 30000 },
  build: { name: 'Build {timestamp}', environment: 'test' },
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
    timeout: 30000,
  },
  comparison: { threshold: 2.0 },
  tdd: { openReport: false },
  plugins: [],
};

/**
 * Valid config scopes for reading
 */
export const READ_SCOPES = ['project', 'global', 'merged'];

/**
 * Valid config scopes for writing
 */
export const WRITE_SCOPES = ['project', 'global'];

// ============================================================================
// Scope Validation
// ============================================================================

/**
 * Validate that a scope is valid for reading
 * @param {string} scope - Scope to validate
 * @returns {{ valid: boolean, error: Error|null }}
 */
export function validateReadScope(scope) {
  if (!READ_SCOPES.includes(scope)) {
    return {
      valid: false,
      error: new VizzlyError(
        `Invalid config scope: ${scope}. Must be 'project', 'global', or 'merged'`,
        'INVALID_CONFIG_SCOPE'
      ),
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate that a scope is valid for writing
 * @param {string} scope - Scope to validate
 * @returns {{ valid: boolean, error: Error|null }}
 */
export function validateWriteScope(scope) {
  if (!WRITE_SCOPES.includes(scope)) {
    return {
      valid: false,
      error: new VizzlyError(
        `Invalid config scope for update: ${scope}. Must be 'project' or 'global'`,
        'INVALID_CONFIG_SCOPE'
      ),
    };
  }
  return { valid: true, error: null };
}

// ============================================================================
// Deep Merge
// ============================================================================

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object (new object, inputs not mutated)
 */
export function deepMerge(target, source) {
  let output = { ...target };

  for (let key of Object.keys(source)) {
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
        output[key] = deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

// ============================================================================
// Config Merging with Source Tracking
// ============================================================================

/**
 * Ensure value is a plain object, return empty object otherwise
 * @param {*} value - Value to check
 * @returns {Object} The value if it's an object, empty object otherwise
 */
function ensureObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
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

  let mergedConfig = {};
  let sources = {};

  // Layer 1: Defaults
  for (let key of Object.keys(CONFIG_DEFAULTS)) {
    mergedConfig[key] = CONFIG_DEFAULTS[key];
    sources[key] = 'default';
  }

  // Layer 2: Global config (auth, project mappings, user preferences)
  if (safeGlobalConfig.auth) {
    mergedConfig.auth = safeGlobalConfig.auth;
    sources.auth = 'global';
  }

  if (safeGlobalConfig.projects) {
    mergedConfig.projects = safeGlobalConfig.projects;
    sources.projects = 'global';
  }

  // Layer 3: Project config file
  for (let key of Object.keys(safeProjectConfig)) {
    mergedConfig[key] = safeProjectConfig[key];
    sources[key] = 'project';
  }

  // Layer 4: Environment variables
  for (let key of Object.keys(safeEnvOverrides)) {
    mergedConfig[key] = safeEnvOverrides[key];
    sources[key] = 'env';
  }

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

// ============================================================================
// Config Result Building
// ============================================================================

/**
 * Build a project config result object
 * @param {Object|null} config - Config object or null if not found
 * @param {string|null} filepath - Path to config file or null
 * @returns {{ config: Object, filepath: string|null, isEmpty: boolean }}
 */
export function buildProjectConfigResult(config, filepath) {
  if (!config) {
    return {
      config: {},
      filepath: null,
      isEmpty: true,
    };
  }

  return {
    config,
    filepath,
    isEmpty: Object.keys(config).length === 0,
  };
}

/**
 * Build a global config result object
 * @param {Object} config - Global config object
 * @param {string} filepath - Path to global config file
 * @returns {{ config: Object, filepath: string, isEmpty: boolean }}
 */
export function buildGlobalConfigResult(config, filepath) {
  return {
    config,
    filepath,
    isEmpty: Object.keys(config).length === 0,
  };
}

/**
 * Build a merged config result object
 * @param {Object} options - Build options
 * @returns {{ config: Object, sources: Object, projectFilepath: string|null, globalFilepath: string }}
 */
export function buildMergedConfigResult({
  projectConfig,
  globalConfig,
  envOverrides,
  projectFilepath,
  globalFilepath,
}) {
  let { config, sources } = buildMergedConfig({
    projectConfig,
    globalConfig,
    envOverrides,
  });

  return {
    config,
    sources,
    projectFilepath,
    globalFilepath,
  };
}

// ============================================================================
// Config Serialization
// ============================================================================

/**
 * Stringify a value with proper indentation for JavaScript output
 * @param {*} value - Value to stringify
 * @param {number} depth - Current depth for indentation
 * @returns {string} JavaScript representation of value
 */
export function stringifyWithIndent(value, depth = 0) {
  let indent = '  '.repeat(depth);
  let prevIndent = depth > 0 ? '  '.repeat(depth - 1) : '';

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
      item => `${indent}${stringifyWithIndent(item, depth + 1)}`
    );
    return `[\n${items.join(',\n')}\n${prevIndent}]`;
  }

  if (typeof value === 'object') {
    let keys = Object.keys(value);
    if (keys.length === 0) return '{}';

    let items = keys.map(key => {
      let val = stringifyWithIndent(value[key], depth + 1);
      return `${indent}${key}: ${val}`;
    });

    return `{\n${items.join(',\n')}\n${prevIndent}}`;
  }

  return String(value);
}

/**
 * Serialize config to JavaScript module format
 * @param {Object} config - Config object to serialize
 * @returns {string} JavaScript source code
 */
export function serializeToJavaScript(config) {
  let lines = [
    '/**',
    ' * Vizzly Configuration',
    ' * @see https://docs.vizzly.dev/cli/configuration',
    ' */',
    '',
    "import { defineConfig } from '@vizzly-testing/cli/config';",
    '',
    'export default defineConfig(',
    stringifyWithIndent(config, 1),
    ');',
    '',
  ];

  return lines.join('\n');
}

/**
 * Serialize config to JSON format
 * @param {Object} config - Config object to serialize
 * @returns {string} JSON string with 2-space indentation
 */
export function serializeToJson(config) {
  return JSON.stringify(config, null, 2);
}

/**
 * Determine the serialization format based on filepath
 * @param {string} filepath - Path to config file
 * @returns {'javascript'|'json'|'package'|'unknown'} Format type
 */
export function getConfigFormat(filepath) {
  if (filepath.endsWith('.js') || filepath.endsWith('.mjs')) {
    return 'javascript';
  }
  if (filepath.endsWith('.json') && !filepath.endsWith('package.json')) {
    return 'json';
  }
  if (filepath.endsWith('package.json')) {
    return 'package';
  }
  return 'unknown';
}

/**
 * Serialize config for writing to file
 * @param {Object} config - Config object to serialize
 * @param {string} filepath - Target file path
 * @returns {{ content: string|null, format: string, error: Error|null }}
 */
export function serializeConfig(config, filepath) {
  let format = getConfigFormat(filepath);

  if (format === 'javascript') {
    return { content: serializeToJavaScript(config), format, error: null };
  }

  if (format === 'json') {
    return { content: serializeToJson(config), format, error: null };
  }

  if (format === 'package') {
    // Can't serialize standalone, need existing package.json
    return { content: null, format, error: null };
  }

  return {
    content: null,
    format,
    error: new VizzlyError(
      `Unsupported config file format: ${filepath}`,
      'UNSUPPORTED_CONFIG_FORMAT'
    ),
  };
}

// ============================================================================
// Config Extraction
// ============================================================================

/**
 * Extract config from cosmiconfig result (handles .default exports)
 * @param {Object|null} result - Cosmiconfig result
 * @returns {{ config: Object|null, filepath: string|null }}
 */
export function extractCosmiconfigResult(result) {
  if (!result || !result.config) {
    return { config: null, filepath: null };
  }

  // Handle both `export default` and `module.exports`
  let config = result.config.default || result.config;

  return { config, filepath: result.filepath };
}

// ============================================================================
// Validation Result Building
// ============================================================================

/**
 * Build a validation success result
 * @param {Object} validatedConfig - Validated config
 * @returns {{ valid: true, config: Object, errors: [] }}
 */
export function buildValidationSuccess(validatedConfig) {
  return {
    valid: true,
    config: validatedConfig,
    errors: [],
  };
}

/**
 * Build a validation failure result
 * @param {Error} error - Validation error
 * @returns {{ valid: false, config: null, errors: Array }}
 */
export function buildValidationFailure(error) {
  return {
    valid: false,
    config: null,
    errors: error.errors || [{ message: error.message }],
  };
}
