/**
 * Vizzly CLI plugin for Static Site
 * Registers the `vizzly static-site` command
 */

import packageJson from '../package.json' with { type: 'json' };
import { getDefaultConcurrency } from './config-schema.js';

export default {
  name: 'static-site',
  version: packageJson.version,

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
        type: 'chromium',
        headless: true,
        args: [],
      },
      screenshot: {
        fullPage: true,
        omitBackground: false,
        timeout: 45_000,
        requestTimeout: 45_000,
      },
      concurrency: getDefaultConcurrency(),
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
   * @param {Object} context.output - Output utilities
   * @param {Object} context.services - Service container
   */
  register(program, { config, output, services }) {
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
      .option(
        '--browser <type>',
        'Browser to use: chromium, firefox, webkit (default: chromium)'
      )
      .option('--browser-args <args>', 'Additional browser arguments')
      .option('--headless', 'Run browser in headless mode')
      .option('--no-headless', 'Run browser with a visible window')
      .option('--full-page', 'Capture full page screenshots')
      .option('--no-full-page', 'Capture viewport-only screenshots')
      .option(
        '--timeout <ms>',
        'Screenshot timeout in milliseconds (default: 45000)',
        parseInt
      )
      .option(
        '--request-timeout <ms>',
        'Vizzly screenshot request timeout in milliseconds',
        parseInt
      )
      .option(
        '--dry-run',
        'Print discovered pages without capturing screenshots'
      )
      .option('--use-sitemap', 'Use sitemap.xml for page discovery')
      .option('--no-use-sitemap', 'Disable sitemap.xml page discovery')
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
            output,
            config,
            services,
          });
        } catch (error) {
          console.error('Failed to run Static Site plugin:', error);
          if (output?.error) {
            output.error('Failed to run Static Site plugin:', error);
          }
          process.exit(1);
        }
      });
  },
};
