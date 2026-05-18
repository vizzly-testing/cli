#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { VizzlyError } from '../errors/vizzly-error.js';
import { loadPlugins } from '../plugin-loader.js';
import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';

let configValueSchema = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(configValueSchema),
    z.record(z.string(), configValueSchema),
  ])
);
let configSchemaValidator = z.record(z.string(), configValueSchema);

function createInitDeps(deps = {}) {
  return {
    access: deps.access || fs.access,
    cwd: deps.cwd || (() => process.cwd()),
    loadConfig: deps.loadConfig || loadConfig,
    loadPlugins: deps.loadPlugins || loadPlugins,
    output: deps.output || output,
    writeFile: deps.writeFile || fs.writeFile,
  };
}

function configureOutput(output, options) {
  output.configure({
    json: options.json || false,
    verbose: options.verbose || false,
    color: options.color !== false,
  });
}

export function getInitConfigPath(cwd = process.cwd()) {
  return path.join(cwd, 'vizzly.config.js');
}

export async function fileExists(filePath, access = fs.access) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getPluginsWithConfig(plugins = []) {
  return plugins.filter(plugin => plugin.configSchema);
}

export function getPluginConfigNames(plugins = []) {
  return getPluginsWithConfig(plugins).map(plugin => plugin.name);
}

function formatObjectKey(key) {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return key;
  }

  return formatValue(key);
}

export function formatValue(value, depth = 0) {
  let indent = '  '.repeat(depth);
  let nextIndent = '  '.repeat(depth + 1);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    return `'${value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    let items = value.map(item => {
      let formatted = formatValue(item, depth + 1);
      return `${nextIndent}${formatted}`;
    });

    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (typeof value === 'object') {
    let entries = Object.entries(value);
    if (entries.length === 0) return '{}';

    let props = entries.map(([key, entryValue]) => {
      let formatted = formatValue(entryValue, depth + 1);
      return `${nextIndent}${formatObjectKey(key)}: ${formatted}`;
    });

    return `{\n${props.join(',\n')}\n${indent}}`;
  }

  return String(value);
}

export function formatPluginConfig(plugin, output = null) {
  try {
    configSchemaValidator.parse(plugin.configSchema);

    let configEntries = [];

    for (let [key, value] of Object.entries(plugin.configSchema)) {
      let formattedValue = formatValue(value, 1);
      configEntries.push(
        `  // ${plugin.name} plugin configuration\n  ${formatObjectKey(key)}: ${formattedValue}`
      );
    }

    return configEntries.join(',\n\n');
  } catch (error) {
    if (error instanceof z.ZodError) {
      let messages = error.issues.map(
        zodError => `${zodError.path.join('.')}: ${zodError.message}`
      );
      output?.warn(
        `Invalid config schema for plugin ${plugin.name}: ${messages.join(', ')}`
      );
    } else {
      output?.warn(
        `Failed to format config for plugin ${plugin.name}: ${error.message}`
      );
    }
    return '';
  }
}

export function generatePluginConfigs(plugins = [], output = null) {
  let sections = [];

  for (let plugin of plugins) {
    if (plugin.configSchema) {
      let configStr = formatPluginConfig(plugin, output);
      if (configStr) {
        sections.push(configStr);
      }
    }
  }

  return sections.length > 0 ? sections.join(',\n\n') : '';
}

export function createConfigContent(plugins = [], output = null) {
  let coreConfig = `export default {
  // Server configuration (for run command)
  server: {
    port: 47392,
    timeout: 30000
  },

  // Build configuration
  build: {
    name: 'Build {timestamp}',
    environment: 'test'
  },

  // Upload configuration (for upload command)
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
    timeout: 30000
  },

  // Comparison configuration (CIEDE2000 Delta E: 0=exact, 1=JND, 2=recommended)
  comparison: {
    threshold: 2.0,
    minClusterSize: 2
  },

  // TDD configuration
  tdd: {
    openReport: false // Whether to auto-open HTML report in browser
  }`;

  let pluginConfigs = generatePluginConfigs(plugins, output);
  if (pluginConfigs) {
    coreConfig += `,\n\n${pluginConfigs}`;
  }

  return `${coreConfig}\n};\n`;
}

function writeHumanCreatedOutput(output, plugins) {
  output.header('init');
  output.complete('Created vizzly.config.js');

  let pluginsWithConfig = getPluginsWithConfig(plugins);
  if (pluginsWithConfig.length > 0) {
    output.hint(`Added config for ${pluginsWithConfig.length} plugin(s):`);
    output.list(
      pluginsWithConfig.map(plugin => plugin.name),
      { indent: 4 }
    );
  }
}

function showNextSteps(output) {
  output.blank();
  output.labelValue('Next steps', '');
  output.list([
    'Set your API token: export VIZZLY_TOKEN="your-api-key"',
    'Run your tests with Vizzly: npx vizzly run "npm test"',
    'Upload screenshots: npx vizzly upload ./screenshots',
  ]);
}

async function writeConfigFile({
  configPath,
  plugins,
  options,
  output,
  writeFile,
}) {
  let coreConfig = createConfigContent(plugins, output);

  await writeFile(configPath, coreConfig, 'utf8');

  if (!options.json) {
    writeHumanCreatedOutput(output, plugins);
  }
}

async function loadInitPlugins(options, deps) {
  if (options.plugins) {
    return options.plugins;
  }

  try {
    let config = await deps.loadConfig(options.config, {});
    return await deps.loadPlugins(options.config, config, null);
  } catch {
    return [];
  }
}

// Export factory function for CLI
export function createInitCommand(options) {
  return () => init(options);
}

export async function init(options = {}, deps = {}) {
  let resolvedDeps = createInitDeps(deps);

  configureOutput(resolvedDeps.output, options);

  let plugins = await loadInitPlugins(options, resolvedDeps);
  let configPath = getInitConfigPath(resolvedDeps.cwd());
  let hasConfig = await fileExists(configPath, resolvedDeps.access);

  if (hasConfig && !options.force) {
    if (options.json) {
      resolvedDeps.output.data({
        status: 'skipped',
        reason: 'config_exists',
        configPath,
        message:
          'A vizzly.config.js file already exists. Use --force to overwrite.',
      });
      return { status: 'skipped', configPath };
    }

    resolvedDeps.output.header('init');
    resolvedDeps.output.warn('A vizzly.config.js file already exists');
    resolvedDeps.output.hint('Use --force to overwrite');
    return { status: 'skipped', configPath };
  }

  try {
    await writeConfigFile({
      configPath,
      plugins,
      options,
      output: resolvedDeps.output,
      writeFile: resolvedDeps.writeFile,
    });

    let pluginNames = getPluginConfigNames(plugins);

    if (options.json) {
      resolvedDeps.output.data({
        status: 'created',
        configPath,
        plugins: pluginNames,
      });
      return { status: 'created', configPath, plugins: pluginNames };
    }

    showNextSteps(resolvedDeps.output);

    resolvedDeps.output.blank();
    resolvedDeps.output.complete('Vizzly CLI setup complete');

    return { status: 'created', configPath, plugins: pluginNames };
  } catch (error) {
    throw new VizzlyError(
      'Failed to initialize Vizzly configuration',
      'INIT_FAILED',
      { error: error.message }
    );
  }
}
