/**
 * Example Vizzly CLI Plugin
 *
 * This demonstrates how to create a custom plugin for the Vizzly CLI.
 * Plugins can add new commands, extend functionality, and integrate with
 * the shared Vizzly infrastructure (config, output, services).
 */

export default {
  // Required: Unique plugin identifier
  name: 'example-plugin',

  // Optional but recommended: Plugin version
  version: '1.0.0',

  /**
   * Register plugin commands and functionality
   *
   * @param {import('commander').Command} program - Commander.js program instance
   * @param {import('@vizzly-testing/cli').PluginContext} context - Plugin context
   */
  register(program, { config, output, services }) {
    // Example 1: Simple command with no arguments
    program
      .command('hello')
      .description('Say hello from the example plugin')
      .action(() => {
        output.info('Hello from the example plugin!');
        output.info(`Config environment: ${config.build?.environment || 'not set'}`);
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

        output.info(greeting);
      });

    // Example 3: Command that uses Vizzly stable services API
    program
      .command('check-services')
      .description('Verify access to Vizzly services')
      .action(async () => {
        try {
          output.info('Checking Vizzly services...');

          // Access services from the stable API
          let { testRunner, serverManager } = services;

          // Verify testRunner is available
          if (typeof testRunner.createBuild === 'function') {
            output.success('testRunner.createBuild is available');
          }

          if (typeof testRunner.finalizeBuild === 'function') {
            output.success('testRunner.finalizeBuild is available');
          }

          // Verify serverManager is available
          if (typeof serverManager.start === 'function') {
            output.success('serverManager.start is available');
          }

          if (typeof serverManager.stop === 'function') {
            output.success('serverManager.stop is available');
          }

          output.info(`API URL: ${config.apiUrl || 'https://app.vizzly.dev'}`);
          output.info(`API Token: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'Not set'}`);
        } catch (error) {
          output.error(`Failed to access services: ${error.message}`);
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

          output.info(`Looking for screenshots in: ${screenshotsDir}`);

          let files = await glob('**/*.{png,jpg,jpeg}', {
            cwd: screenshotsDir,
            absolute: false,
          });

          if (files.length === 0) {
            output.warn('No screenshot files found');
          } else {
            output.info(`Found ${files.length} screenshot(s):`);
            files.forEach(file => output.info(`  - ${file}`));
          }
        } catch (error) {
          output.error(`Failed to list screenshots: ${error.message}`);
          process.exit(1);
        }
      });

    output.debug('Example plugin registered successfully');
  },
};
