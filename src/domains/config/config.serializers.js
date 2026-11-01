import { VizzlyError } from '../../errors/vizzly-error.js';
import { buildMergedConfig } from './config.normalizers.js';

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
