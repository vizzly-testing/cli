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
    // Override logger level to 'info' for storybook command
    // The CLI logger defaults to 'warn' but storybook needs 'info' for progress
    logger.level = 'info';

    program
      .command('storybook <path>')
      .description('Capture screenshots from static Storybook build')
      .option(
        '--viewports <list>',
        'Comma-separated viewport definitions (name:WxH)'
      )
      .option(
        '--concurrency <n>',
        'Number of parallel stories to process',
        parseInt,
        3
      )
      .option('--include <pattern>', 'Include story pattern (glob)')
      .option('--exclude <pattern>', 'Exclude story pattern (glob)')
      .option('--browser-args <args>', 'Additional Puppeteer browser arguments')
      .option(
        '--headless',
        'Run browser in headless mode (default: true)',
        true
      )
      .option('--full-page', 'Capture full page screenshots', false)
      .action(async (path, options) => {
        try {
          let { run } = await import('./index.js');

          // Merge global options (like --config) with command options
          let globalOptions = program.opts();
          let mergedOptions = { ...globalOptions, ...options };

          await run(path, mergedOptions, {
            logger,
            config,
            services,
          });
        } catch (error) {
          console.error('Failed to run Storybook plugin:', error);
          if (logger && logger.error) {
            logger.error('Failed to run Storybook plugin:', error.message);
          }
          process.exit(1);
        }
      });
  },
};
