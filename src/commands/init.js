#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createComponentLogger } from '../utils/logger-factory.js';
import { loadPlugins } from '../plugin-loader.js';
import { loadConfig } from '../utils/config-loader.js';
import { z } from 'zod';

/**
 * Simple configuration setup for Vizzly CLI
 */
export class InitCommand {
  constructor(logger, plugins = []) {
    this.logger = logger || createComponentLogger('INIT', { level: 'info' });
    this.plugins = plugins;
  }

  async run(options = {}) {
    this.logger.info('🎯 Initializing Vizzly configuration...\n');

    try {
      // Check for existing config
      const configPath = path.join(process.cwd(), 'vizzly.config.js');
      const hasConfig = await this.fileExists(configPath);

      if (hasConfig && !options.force) {
        this.logger.info(
          '❌ A vizzly.config.js file already exists. Use --force to overwrite.'
        );
        return;
      }

      // Generate config file with defaults
      await this.generateConfigFile(configPath);

      // Show next steps
      this.showNextSteps();

      this.logger.info('\n✅ Vizzly CLI setup complete!');
    } catch (error) {
      throw new VizzlyError(
        'Failed to initialize Vizzly configuration',
        'INIT_FAILED',
        { error: error.message }
      );
    }
  }

  async generateConfigFile(configPath) {
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

  // Comparison configuration
  comparison: {
    threshold: 0.1
  },

  // TDD configuration
  tdd: {
    openReport: false // Whether to auto-open HTML report in browser
  }`;

    // Add plugin configurations
    let pluginConfigs = this.generatePluginConfigs();
    if (pluginConfigs) {
      coreConfig += ',\n\n' + pluginConfigs;
    }

    coreConfig += '\n};\n';

    await fs.writeFile(configPath, coreConfig, 'utf8');
    this.logger.info(`📄 Created vizzly.config.js`);

    // Log discovered plugins
    let pluginsWithConfig = this.plugins.filter(p => p.configSchema);
    if (pluginsWithConfig.length > 0) {
      this.logger.info(
        `   Added config for ${pluginsWithConfig.length} plugin(s):`
      );
      pluginsWithConfig.forEach(p => {
        this.logger.info(`   - ${p.name}`);
      });
    }
  }

  /**
   * Generate configuration sections for plugins
   * @returns {string} Plugin config sections as formatted string
   */
  generatePluginConfigs() {
    let sections = [];

    for (let plugin of this.plugins) {
      if (plugin.configSchema) {
        let configStr = this.formatPluginConfig(plugin);
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
      let configValueSchema = z.lazy(() =>
        z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.null(),
          z.array(configValueSchema),
          z.record(configValueSchema),
        ])
      );
      let configSchemaValidator = z.record(configValueSchema);
      configSchemaValidator.parse(plugin.configSchema);

      let configEntries = [];

      for (let [key, value] of Object.entries(plugin.configSchema)) {
        let formattedValue = this.formatValue(value, 1);
        configEntries.push(
          `  // ${plugin.name} plugin configuration\n  ${key}: ${formattedValue}`
        );
      }

      return configEntries.join(',\n\n');
    } catch (error) {
      if (error instanceof z.ZodError) {
        let messages = error.errors.map(
          e => `${e.path.join('.')}: ${e.message}`
        );
        this.logger.warn(
          `Invalid config schema for plugin ${plugin.name}: ${messages.join(', ')}`
        );
      } else {
        this.logger.warn(
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
    let indent = '  '.repeat(depth);
    let nextIndent = '  '.repeat(depth + 1);

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      let items = value.map(item => {
        let formatted = this.formatValue(item, depth + 1);
        return `${nextIndent}${formatted}`;
      });

      return `[\n${items.join(',\n')}\n${indent}]`;
    }

    if (typeof value === 'object') {
      let entries = Object.entries(value);
      if (entries.length === 0) return '{}';

      let props = entries.map(([k, v]) => {
        let formatted = this.formatValue(v, depth + 1);
        return `${nextIndent}${k}: ${formatted}`;
      });

      return `{\n${props.join(',\n')}\n${indent}}`;
    }

    return String(value);
  }

  showNextSteps() {
    this.logger.info('\n📚 Next steps:');
    this.logger.info('   1. Set your API token:');
    this.logger.info('      export VIZZLY_TOKEN="your-api-key"');
    this.logger.info('   2. Run your tests with Vizzly:');
    this.logger.info('      npx vizzly run "npm test"');
    this.logger.info('   3. Upload screenshots:');
    this.logger.info('      npx vizzly upload ./screenshots');
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
  const command = new InitCommand(options.logger, options.plugins);
  return () => command.run(options);
}

// Simple export for direct CLI usage
export async function init(options = {}) {
  let plugins = [];

  // Try to load plugins if not provided
  if (!options.plugins) {
    try {
      let config = await loadConfig(options.config, {});
      let logger = createComponentLogger('INIT', { level: 'debug' });
      plugins = await loadPlugins(options.config, config, logger);
    } catch {
      // Silent fail - plugins are optional for init
    }
  } else {
    plugins = options.plugins;
  }

  const command = new InitCommand(null, plugins);
  return await command.run(options);
}
