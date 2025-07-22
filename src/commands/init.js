#!/usr/bin/env node
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { detectFramework } from '../utils/framework-detector.js';
import { VizzlyError } from '../errors/vizzly-error.js';

/**
 * Interactive configuration wizard for Vizzly CLI
 */
export class InitCommand {
  constructor(logger = console) {
    this.logger = logger;
  }

  async run(options = {}) {
    this.logger.info('🎯 Welcome to Vizzly CLI Setup Wizard\n');

    try {
      // Check for existing config
      const configPath = path.join(process.cwd(), 'vizzly.config.js');
      const hasConfig = await this.fileExists(configPath);

      if (hasConfig && !options.force) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'A vizzly.config.js file already exists. Overwrite it?',
            default: false,
          },
        ]);

        if (!overwrite) {
          this.logger.info('Setup cancelled.');
          return;
        }
      }

      // Detect project framework
      const detectedFramework = await detectFramework();

      // Collect configuration
      const config = await this.collectConfiguration(detectedFramework);

      // Generate config file
      await this.generateConfigFile(config, configPath);

      // Show next steps
      this.showNextSteps(config);

      this.logger.info('\n✅ Vizzly CLI setup complete!');
    } catch (error) {
      throw new VizzlyError(
        'Failed to initialize Vizzly configuration',
        'INIT_FAILED',
        { error: error.message }
      );
    }
  }

  async collectConfiguration(detectedFramework) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your Vizzly API key:',
        when: !process.env.VIZZLY_TOKEN,
        validate: input => input.length > 0 || 'API key is required',
      },
      {
        type: 'list',
        name: 'framework',
        message: 'Select your testing framework:',
        choices: [
          { name: 'Playwright', value: 'playwright' },
          { name: 'Cypress', value: 'cypress' },
          { name: 'Puppeteer', value: 'puppeteer' },
          { name: 'Other', value: 'other' },
        ],
        default: detectedFramework,
      },
      {
        type: 'input',
        name: 'testCommand',
        message: 'Enter your test command:',
        default: this.getDefaultTestCommand(detectedFramework || 'other'),
      },
      {
        type: 'input',
        name: 'screenshotDir',
        message: 'Screenshot directory:',
        default: './screenshots',
      },
      {
        type: 'number',
        name: 'serverPort',
        message: 'Local server port:',
        default: 3001,
        validate: input =>
          (input > 0 && input < 65536) || 'Invalid port number',
      },
      {
        type: 'confirm',
        name: 'enableTDD',
        message: 'Enable TDD mode by default?',
        default: false,
      },
      {
        type: 'list',
        name: 'uploadConcurrency',
        message: 'Upload concurrency:',
        choices: [
          { name: 'Conservative (2 concurrent)', value: 2 },
          { name: 'Balanced (5 concurrent)', value: 5 },
          { name: 'Aggressive (10 concurrent)', value: 10 },
        ],
        default: 5,
      },
    ]);

    return {
      ...answers,
      apiKey: answers.apiKey || process.env.VIZZLY_TOKEN,
    };
  }

  async generateConfigFile(config, configPath) {
    const configContent = `import { defineConfig } from '@vizzly-test/cli';

export default defineConfig({
  ${config.apiKey && !process.env.VIZZLY_TOKEN ? `apiKey: '${config.apiKey}',` : '// apiKey: process.env.VIZZLY_TOKEN,'}
  
  // Test framework integration
  framework: '${config.framework}',
  testCommand: '${config.testCommand}',
  
  // Server configuration
  server: {
    port: ${config.serverPort},
    screenshotPath: '/vizzly-screenshot'
  },
  
  // Build configuration
  build: {
    screenshotDir: '${config.screenshotDir}',
    ${config.enableTDD ? 'tddMode: true,' : '// tddMode: false,'}
  },
  
  // Upload configuration
  upload: {
    concurrency: ${config.uploadConcurrency},
    retries: 3
  },
  
  // Comparison configuration
  comparison: {
    threshold: 0.1,
    ignoreAntialiasing: true
  }
});
`;

    await fs.writeFile(configPath, configContent, 'utf8');
    this.logger.info(`\n📄 Created vizzly.config.js`);
  }

  showNextSteps(config) {
    this.logger.info('\n📚 Next steps:');

    if (config.apiKey && !process.env.VIZZLY_TOKEN) {
      this.logger.info('   1. Add your API key to environment variables:');
      this.logger.info('      export VIZZLY_TOKEN="your-api-key"');
    }

    this.logger.info(`   2. Run your tests with visual testing:`);
    this.logger.info(`      npx vizzly run "${config.testCommand}"`);

    this.logger.info(`   3. Upload screenshots from CI:`);
    this.logger.info(`      npx vizzly upload ${config.screenshotDir}`);

    if (config.enableTDD) {
      this.logger.info(
        `   4. TDD mode is enabled - screenshots will compare locally`
      );
    }
  }

  getDefaultTestCommand(framework) {
    const commands = {
      playwright: 'npx playwright test',
      cypress: 'npx cypress run',
      puppeteer: 'npm test',
      other: 'npm test',
    };
    return commands[framework] || 'npm test';
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
