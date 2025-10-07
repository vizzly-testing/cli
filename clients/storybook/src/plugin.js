/**
 * Vizzly CLI plugin for Storybook
 * Registers the `vizzly storybook` command
 */

export default {
  name: 'storybook',
  version: '1.0.0',

  /**
   * Register the storybook command with the CLI
   * @param {import('commander').Command} program - Commander program instance
   * @param {Object} context - Plugin context
   * @param {Object} context.config - Vizzly configuration
   * @param {Object} context.logger - Logger instance
   * @param {Object} context.services - Service container
   */
  register(program, { config, logger, services }) {
    program
      .command('storybook <path>')
      .description('Capture screenshots from static Storybook build')
      .option('--viewports <list>', 'Comma-separated viewport definitions (name:WxH)')
      .option('--concurrency <n>', 'Number of parallel stories to process', parseInt, 3)
      .option('--include <pattern>', 'Include story pattern (glob)')
      .option('--exclude <pattern>', 'Exclude story pattern (glob)')
      .option('--config <path>', 'Path to custom config file')
      .option('--browser-args <args>', 'Additional Puppeteer browser arguments')
      .option('--headless', 'Run browser in headless mode (default: true)', true)
      .option('--full-page', 'Capture full page screenshots', false)
      .action(async (path, options) => {
        try {
          let { run } = await import('./index.js');

          await run(path, options, {
            logger,
            config,
            services,
          });
        } catch (error) {
          logger?.error?.('Failed to run Storybook plugin:', error.message);
          throw error;
        }
      });
  },
};
