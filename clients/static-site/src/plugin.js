/**
 * Vizzly CLI plugin for Static Site
 * Registers the `vizzly static-site` command
 */

export default {
  name: 'static-site',
  version: '0.1.0',

  /**
   * Default configuration schema for init command
   * This will be added to vizzly.config.js when running `vizzly init`
   */
  configSchema: {
    staticSite: {
      viewports: [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'desktop', width: 1920, height: 1080 },
      ],
      browser: {
        headless: true,
        args: [],
      },
      screenshot: {
        fullPage: false,
        omitBackground: false,
      },
      concurrency: 3,
      include: null,
      exclude: null,
      pageDiscovery: {
        useSitemap: true,
        sitemapPath: 'sitemap.xml',
        scanHtml: true,
      },
    },
  },

  /**
   * Register the static-site command with the CLI
   * @param {import('commander').Command} program - Commander program instance
   * @param {Object} context - Plugin context
   * @param {Object} context.config - Vizzly configuration
   * @param {Object} context.logger - Logger instance
   * @param {Object} context.services - Service container
   */
  register(program, { config, logger, services }) {
    program
      .command('static-site <path>')
      .description(
        'Capture screenshots from static site build (Gatsby, Astro, Jekyll, Next.js, etc.)'
      )
      .option(
        '--viewports <list>',
        'Comma-separated viewport definitions (name:WxH)'
      )
      .option(
        '--concurrency <n>',
        'Number of parallel pages to process',
        parseInt
      )
      .option('--include <pattern>', 'Include page pattern (glob)')
      .option('--exclude <pattern>', 'Exclude page pattern (glob)')
      .option('--browser-args <args>', 'Additional Puppeteer browser arguments')
      .option('--headless', 'Run browser in headless mode')
      .option('--full-page', 'Capture full page screenshots')
      .option('--use-sitemap', 'Use sitemap.xml for page discovery')
      .option(
        '--sitemap-path <path>',
        'Path to sitemap.xml relative to build directory'
      )
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
          console.error('Failed to run Static Site plugin:', error);
          if (logger?.error) {
            logger.error('Failed to run Static Site plugin:', error.message);
          }
          process.exit(1);
        }
      });
  },
};
