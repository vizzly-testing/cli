#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { VizzlyError } from '../errors/vizzly-error.js';
import { loadPlugins } from '../plugin-loader.js';
import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';

/**
 * Simple configuration setup for Vizzly CLI
 */
export class InitCommand {
  constructor(plugins = []) {
    this.plugins = plugins;
  }

  async run(options = {}) {
    // Check for existing config
    let configPath = path.join(process.cwd(), 'vizzly.config.js');
    let hasConfig = await this.fileExists(configPath);

    if (hasConfig && !options.force) {
      // JSON output for skipped
      if (options.json) {
        output.data({
          status: 'skipped',
          reason: 'config_exists',
          configPath,
          message:
            'A vizzly.config.js file already exists. Use --force to overwrite.',
        });
        return { status: 'skipped', configPath };
      }

      output.header('init');
      output.warn('A vizzly.config.js file already exists');
      output.hint('Use --force to overwrite');
      return { status: 'skipped', configPath };
    }

    try {
      // Generate config file with defaults
      await this.generateConfigFile(configPath, options);

      // Get plugins with config for JSON output
      let pluginsWithConfig = this.plugins.filter(p => p.configSchema);
      let pluginNames = pluginsWithConfig.map(p => p.name);

      // JSON output for success
      if (options.json) {
        output.data({
          status: 'created',
          configPath,
          plugins: pluginNames,
        });
        return { status: 'created', configPath, plugins: pluginNames };
      }

      // Show next steps
      this.showNextSteps();

      output.blank();
      output.complete('Vizzly CLI setup complete');

      return { status: 'created', configPath, plugins: pluginNames };
    } catch (error) {
      throw new VizzlyError(
        'Failed to initialize Vizzly configuration',
        'INIT_FAILED',
        { error: error.message }
      );
    }
  }

  async generateConfigFile(configPath, options = {}) {
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
    threshold: 2.0
  },

  // TDD configuration
  tdd: {
    openReport: false // Whether to auto-open HTML report in browser
  }`;

    // Add plugin configurations
    const pluginConfigs = this.generatePluginConfigs();
    if (pluginConfigs) {
      coreConfig += `,\n\n${pluginConfigs}`;
    }

    coreConfig += '\n};\n';

    await fs.writeFile(configPath, coreConfig, 'utf8');

    // Skip human-readable output in JSON mode
    if (options.json) return;

    output.header('init');
    output.complete('Created vizzly.config.js');

    // Log discovered plugins
    let pluginsWithConfig = this.plugins.filter(p => p.configSchema);
    if (pluginsWithConfig.length > 0) {
      output.hint(`Added config for ${pluginsWithConfig.length} plugin(s):`);
      output.list(
        pluginsWithConfig.map(p => p.name),
        { indent: 4 }
      );
    }
  }

  /**
   * Generate configuration sections for plugins
   * @returns {string} Plugin config sections as formatted string
   */
  generatePluginConfigs() {
    const sections = [];

    for (const plugin of this.plugins) {
      if (plugin.configSchema) {
        const configStr = this.formatPluginConfig(plugin);
        if (configStr) {
          sections.push(configStr);
        }
      }
    }

    return sections.length > 0 ? sections.join(',\n\n') : '';
  }

  /**
   * Format a plugin's config schema as JavaScript code
   * @param {Object} plugin - Plugin with configSchema
   * @returns {string} Formatted config string
   */
  formatPluginConfig(plugin) {
    try {
      // Validate config schema structure with Zod (defensive check)
      const configValueSchema = z.lazy(() =>
        z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.null(),
          z.array(configValueSchema),
          z.record(configValueSchema),
        ])
      );
      const configSchemaValidator = z.record(configValueSchema);
      configSchemaValidator.parse(plugin.configSchema);

      const configEntries = [];

      for (const [key, value] of Object.entries(plugin.configSchema)) {
        const formattedValue = this.formatValue(value, 1);
        configEntries.push(
          `  // ${plugin.name} plugin configuration\n  ${key}: ${formattedValue}`
        );
      }

      return configEntries.join(',\n\n');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(
          e => `${e.path.join('.')}: ${e.message}`
        );
        output.warn(
          `Invalid config schema for plugin ${plugin.name}: ${messages.join(', ')}`
        );
      } else {
        output.warn(
          `Failed to format config for plugin ${plugin.name}: ${error.message}`
        );
      }
      return '';
    }
  }

  /**
   * Format a JavaScript value with proper indentation
   * @param {*} value - Value to format
   * @param {number} depth - Current indentation depth
   * @returns {string} Formatted value
   */
  formatValue(value, depth = 0) {
    const indent = '  '.repeat(depth);
    const nextIndent = '  '.repeat(depth + 1);

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      const items = value.map(item => {
        const formatted = this.formatValue(item, depth + 1);
        return `${nextIndent}${formatted}`;
      });

      return `[\n${items.join(',\n')}\n${indent}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';

      const props = entries.map(([k, v]) => {
        const formatted = this.formatValue(v, depth + 1);
        return `${nextIndent}${k}: ${formatted}`;
      });

      return `{\n${props.join(',\n')}\n${indent}}`;
    }

    return String(value);
  }

  showNextSteps() {
    output.blank();
    output.labelValue('Next steps', '');
    output.list([
      'Set your API token: export VIZZLY_TOKEN="your-api-key"',
      'Run your tests with Vizzly: npx vizzly run "npm test"',
      'Upload screenshots: npx vizzly upload ./screenshots',
    ]);
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export factory function for CLI
export function createInitCommand(options) {
  const command = new InitCommand(options.plugins);
  return () => command.run(options);
}

// Simple export for direct CLI usage
export async function init(options = {}) {
  output.configure({
    json: options.json || false,
    verbose: options.verbose || false,
    color: options.color !== false,
  });

  let plugins = [];

  // Try to load plugins if not provided
  if (!options.plugins) {
    try {
      const config = await loadConfig(options.config, {});
      plugins = await loadPlugins(options.config, config, null);
    } catch {
      // Silent fail - plugins are optional for init
    }
  } else {
    plugins = options.plugins;
  }

  const command = new InitCommand(plugins);
  return await command.run(options);
}
