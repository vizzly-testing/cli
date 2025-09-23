#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createComponentLogger } from '../utils/logger-factory.js';

/**
 * Simple configuration setup for Vizzly CLI
 */
export class InitCommand {
  constructor(logger) {
    this.logger = logger || createComponentLogger('INIT', { level: 'info' });
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
    const configContent = `export default {
  // API configuration
  // Set VIZZLY_TOKEN environment variable or uncomment and set here:
  // apiKey: 'your-token-here',

  // Server configuration (for run command)
  server: {
    port: 47392,
    timeout: 30000,
    screenshotPath: '/screenshot'
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
  }
};
`;

    await fs.writeFile(configPath, configContent, 'utf8');
    this.logger.info(`📄 Created vizzly.config.js`);
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
  const command = new InitCommand(options.logger);
  return () => command.run(options);
}

// Simple export for direct CLI usage
export async function init(options = {}) {
  const command = new InitCommand();
  return await command.run(options);
}
