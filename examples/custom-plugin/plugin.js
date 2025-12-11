/**
 * Example Vizzly CLI Plugin
 *
 * This demonstrates how to create a custom plugin for the Vizzly CLI.
 * Plugins can add new commands, extend functionality, and integrate with
 * the shared Vizzly infrastructure (config, logger, services).
 */

export default {
  // Required: Unique plugin identifier
  name: 'example-plugin',

  // Optional but recommended: Plugin version
  version: '1.0.0',

  /**
   * Register plugin commands and functionality
   *
   * @param {Object} program - Commander.js program instance
   * @param {Object} context - Shared Vizzly context
   * @param {Object} context.config - Merged Vizzly configuration
   * @param {Object} context.logger - Component logger instance
   * @param {Object} context.services - Service container
   */
  register(program, { config, logger, services }) {
    // Example 1: Simple command with no arguments
    program
      .command('hello')
      .description('Say hello from the example plugin')
      .action(() => {
        logger.info('Hello from the example plugin!');
        logger.info(`Config environment: ${config.build.environment}`);
      });

    // Example 2: Command with arguments and options
    program
      .command('greet <name>')
      .description('Greet someone by name')
      .option('-l, --loud', 'Print in uppercase')
      .action((name, options) => {
        let greeting = `Hello, ${name}!`;

        if (options.loud) {
          greeting = greeting.toUpperCase();
        }

        logger.info(greeting);
      });

    // Example 3: Command that uses Vizzly services
    program
      .command('check-api')
      .description('Check connection to Vizzly API')
      .action(async () => {
        try {
          logger.info('Checking API connection...');

          // Access the API service directly
          let apiService = services.apiService;

          logger.info(`API URL: ${config.apiUrl || 'https://app.vizzly.dev'}`);
          logger.info(`API Token: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'Not set'}`);

          logger.info('API service is available!');
        } catch (error) {
          logger.error(`Failed to access API service: ${error.message}`);
          process.exit(1);
        }
      });

    // Example 4: Command with async file operations
    program
      .command('list-screenshots')
      .description('List screenshot files in the configured directory')
      .action(async () => {
        try {
          let { glob } = await import('glob');
          let screenshotsDir = config.upload?.screenshotsDir || './screenshots';

          logger.info(`Looking for screenshots in: ${screenshotsDir}`);

          let files = await glob('**/*.{png,jpg,jpeg}', {
            cwd: screenshotsDir,
            absolute: false,
          });

          if (files.length === 0) {
            logger.warn('No screenshot files found');
          } else {
            logger.info(`Found ${files.length} screenshot(s):`);
            files.forEach(file => logger.info(`  - ${file}`));
          }
        } catch (error) {
          logger.error(`Failed to list screenshots: ${error.message}`);
          process.exit(1);
        }
      });

    logger.debug('Example plugin registered successfully');
  },
};
