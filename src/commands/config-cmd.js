/**
 * Config command - query and display configuration
 */

import { resolve } from 'node:path';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getProjectMapping as defaultGetProjectMapping } from '../utils/global-config.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Config command - display current configuration
 * @param {string|null} key - Optional specific key to get (dot notation)
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function configCommand(key = null, options = {}, globalOptions = {}, deps = {}) {
  let {
    loadConfig = defaultLoadConfig,
    getProjectMapping = defaultGetProjectMapping,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Load configuration
    let config = await loadConfig(globalOptions.config, { ...globalOptions, ...options });
    let configFile = config._configPath || null;

    // Get project mapping if available
    let currentDir = resolve(process.cwd());
    let projectMapping = await getProjectMapping(currentDir);

    // Build the config object to display
    let displayConfig = {
      server: config.server || { port: 47392, timeout: 30000 },
      build: config.build || {},
      upload: config.upload || {},
      comparison: config.comparison || { threshold: 2.0 },
      tdd: config.tdd || {},
    };

    // Add API config (without exposing full token)
    if (config.apiKey) {
      displayConfig.api = {
        url: config.apiUrl || config.baseUrl,
        tokenConfigured: true,
        tokenPrefix: config.apiKey.substring(0, 8) + '...',
      };
    }

    // If a specific key is requested, extract it
    if (key) {
      let value = getNestedValue(displayConfig, key);

      if (value === undefined) {
        output.error(`Configuration key "${key}" not found`);
        output.hint('Use "vizzly config" without arguments to see all available keys');
        exit(1);
        return;
      }

      if (globalOptions.json) {
        output.data({ key, value });
        output.cleanup();
        return;
      }

      // Simple human output for specific key
      output.header('config');
      output.labelValue(key, formatValue(value));
      output.cleanup();
      return;
    }

    // JSON output for full config
    if (globalOptions.json) {
      output.data({
        configFile,
        config: displayConfig,
        project: projectMapping
          ? {
              name: projectMapping.projectName,
              slug: projectMapping.projectSlug,
              organization: projectMapping.organizationSlug,
            }
          : null,
      });
      output.cleanup();
      return;
    }

    // Human-readable output
    output.header('config');

    // Config file location
    if (configFile) {
      output.labelValue('Config file', configFile);
    } else {
      output.labelValue('Config file', 'Using defaults (no config file found)');
    }
    output.blank();

    // Project context if available
    if (projectMapping) {
      output.labelValue('Project', `${projectMapping.projectName} (${projectMapping.projectSlug})`);
      output.labelValue('Organization', projectMapping.organizationSlug);
      output.blank();
    }

    // Display configuration sections
    displaySection(output, 'Server', displayConfig.server);
    displaySection(output, 'Comparison', displayConfig.comparison);
    displaySection(output, 'TDD', displayConfig.tdd);

    if (globalOptions.verbose) {
      displaySection(output, 'Build', displayConfig.build);
      displaySection(output, 'Upload', displayConfig.upload);

      if (displayConfig.api) {
        displaySection(output, 'API', displayConfig.api);
      }
    } else {
      output.hint('Use --verbose to see all configuration options');
    }

    output.cleanup();
  } catch (error) {
    output.error('Failed to load configuration', error);
    exit(1);
  }
}

/**
 * Display a configuration section
 */
function displaySection(output, title, section) {
  if (!section || Object.keys(section).length === 0) return;

  output.labelValue(title, '');
  for (let [key, value] of Object.entries(section)) {
    output.print(`    ${key}: ${formatValue(value)}`);
  }
  output.blank();
}

/**
 * Format a value for display
 */
function formatValue(value) {
  if (value === null || value === undefined) return 'not set';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Get a nested value using dot notation
 */
function getNestedValue(obj, path) {
  let parts = path.split('.');
  let current = obj;

  for (let part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Validate config command options
 */
export function validateConfigOptions() {
  return [];
}
