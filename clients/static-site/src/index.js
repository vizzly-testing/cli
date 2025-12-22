/**
 * Main entry point for @vizzly-testing/static-site
 * Functional orchestration of page discovery and screenshot capture
 * Uses a tab pool for efficient browser tab management
 */

import { closeBrowser, launchBrowser } from './browser.js';
import { loadConfig } from './config.js';
import { discoverPages } from './crawler.js';
import { createTabPool } from './pool.js';
import { startStaticServer, stopStaticServer } from './server.js';
import { generateTasks, processAllTasks } from './tasks.js';

/**
 * Check if TDD mode is available
 * @param {Function} [debug] - Optional debug logger
 * @returns {Promise<boolean>} True if TDD server is running
 */
async function isTddModeAvailable(debug = () => {}) {
  let { existsSync, readFileSync } = await import('node:fs');
  let { join, parse, dirname } = await import('node:path');

  try {
    // Look for .vizzly/server.json
    let currentDir = process.cwd();
    let root = parse(currentDir).root;

    debug(`Searching for TDD server from ${currentDir}`);

    while (currentDir !== root) {
      let serverJsonPath = join(currentDir, '.vizzly', 'server.json');

      if (existsSync(serverJsonPath)) {
        debug(`Found server.json at ${serverJsonPath}`);
        try {
          let serverInfo = JSON.parse(readFileSync(serverJsonPath, 'utf8'));
          if (serverInfo.port) {
            debug(`Pinging TDD server at port ${serverInfo.port}`);
            // Try to ping the server
            let response = await fetch(
              `http://localhost:${serverInfo.port}/health`
            );
            debug(`TDD server health check: ${response.ok ? 'OK' : 'FAILED'}`);
            return response.ok;
          }
          debug('server.json missing port field');
        } catch (error) {
          debug(`Failed to connect to TDD server: ${error.message}`);
        }
      }
      currentDir = dirname(currentDir);
    }
    debug('No .vizzly/server.json found in parent directories');
  } catch (error) {
    debug(`Error checking for TDD mode: ${error.message}`);
  }

  return false;
}

/**
 * Check if API token is available for run mode
 * @param {Object} config - Vizzly configuration
 * @returns {boolean} True if API token exists
 */
function hasApiToken(config) {
  return !!(config?.apiKey || process.env.VIZZLY_TOKEN);
}

/**
 * Main run function - orchestrates the entire screenshot capture process
 * Uses a tab pool for efficient parallel screenshot capture
 * @param {string} buildPath - Path to static site build
 * @param {Object} options - CLI options
 * @param {Object} context - Plugin context (logger, config, services)
 * @returns {Promise<void>}
 */
export async function run(buildPath, options = {}, context = {}) {
  let { logger, config: vizzlyConfig, services } = context;
  let browser = null;
  let pool = null;
  let serverInfo = null;
  let testRunner = null;
  let serverManager = null;
  let buildId = null;
  let startTime = null;

  if (!logger) {
    throw new Error('Logger is required but was not provided in context');
  }

  try {
    // Load and merge configuration
    let config = await loadConfig(buildPath, options, vizzlyConfig);

    // Handle dry-run mode early - just discover and print pages
    if (options.dryRun) {
      let pages = await discoverPages(config.buildPath, config);
      logger.info(
        `🔍 Dry run: Found ${pages.length} pages in ${config.buildPath}\n`
      );

      if (pages.length === 0) {
        logger.warn('   No pages found matching your configuration.');
        return;
      }

      // Group by source for clarity
      let sitemapPages = pages.filter(p => p.source === 'sitemap');
      let htmlPages = pages.filter(p => p.source === 'html');

      if (sitemapPages.length > 0) {
        logger.info(`   From sitemap (${sitemapPages.length}):`);
        for (let page of sitemapPages) {
          logger.info(`     ${page.path}`);
        }
      }

      if (htmlPages.length > 0) {
        logger.info(`   From HTML scan (${htmlPages.length}):`);
        for (let page of htmlPages) {
          logger.info(`     ${page.path}`);
        }
      }

      // Show task count that would be generated
      let taskCount = pages.length * config.viewports.length;
      logger.info('');
      logger.info(`📸 Would capture ${taskCount} screenshots:`);
      logger.info(
        `   ${pages.length} pages × ${config.viewports.length} viewports`
      );
      logger.info(
        `   Viewports: ${config.viewports.map(v => `${v.name} (${v.width}×${v.height})`).join(', ')}`
      );
      logger.info(`   Concurrency: ${config.concurrency} tabs`);

      return;
    }

    // Determine mode: TDD or Run
    let debug = logger.debug?.bind(logger) || (() => {});
    let isTdd = await isTddModeAvailable(debug);
    let hasToken = hasApiToken(vizzlyConfig);

    if (isTdd) {
      logger.info('📍 TDD mode: Using local server');
    } else if (hasToken) {
      logger.info('☁️  Run mode: Uploading to cloud');
    }

    let buildUrl = null;

    if (!isTdd && hasToken && services) {
      // Run mode: Initialize test runner for build management
      try {
        testRunner = services.testRunner;
        serverManager = services.serverManager;
        startTime = Date.now();

        // Listen for build-created event to get the URL
        testRunner.once('build-created', buildInfo => {
          if (buildInfo.url) {
            buildUrl = buildInfo.url;
            logger.info(`🔗 ${buildInfo.url}`);
          }
        });

        // Detect git info - use dynamic import to access internal utils
        let gitUtils;
        try {
          // Try to import from the installed CLI package
          let cliPath = await import.meta.resolve?.('@vizzly-testing/cli');
          if (cliPath) {
            gitUtils = await import(
              '@vizzly-testing/cli/dist/utils/git.js'
            ).catch(() => null);
          }
        } catch {
          // Fallback: try relative path if in monorepo
          try {
            gitUtils = await import('../../../src/utils/git.js').catch(
              () => null
            );
          } catch {
            gitUtils = null;
          }
        }

        let branch = gitUtils
          ? await gitUtils.detectBranch()
          : process.env.VIZZLY_BRANCH || 'main';
        let commit = gitUtils
          ? await gitUtils.detectCommit()
          : process.env.VIZZLY_COMMIT_SHA || undefined;
        let message = gitUtils
          ? await gitUtils.detectCommitMessage()
          : process.env.VIZZLY_COMMIT_MESSAGE || undefined;
        let buildName = gitUtils
          ? await gitUtils.generateBuildNameWithGit('Static Site')
          : `Static Site ${new Date().toISOString()}`;
        let pullRequestNumber = gitUtils
          ? gitUtils.detectPullRequestNumber()
          : process.env.VIZZLY_PR_NUMBER || undefined;

        // Build options for API
        let runOptions = {
          port: vizzlyConfig?.server?.port || 47392,
          timeout: vizzlyConfig?.server?.timeout || 30000,
          buildName,
          branch,
          commit,
          message,
          environment: vizzlyConfig?.build?.environment,
          threshold: vizzlyConfig?.comparison?.threshold || 0,
          eager: vizzlyConfig?.eager || false,
          allowNoToken: false,
          wait: false,
          uploadAll: false,
          pullRequestNumber,
          parallelId: vizzlyConfig?.parallelId,
        };

        // Create build via API
        buildId = await testRunner.createBuild(runOptions, false);

        // Start screenshot server
        await serverManager.start(buildId, false, false);

        // Set environment for client SDK to connect
        process.env.VIZZLY_SERVER_URL = `http://localhost:${runOptions.port}`;
        process.env.VIZZLY_BUILD_ID = buildId;
        process.env.VIZZLY_ENABLED = 'true';
      } catch (error) {
        // Log the error and continue without cloud mode
        logger.error(`Failed to initialize cloud mode: ${error.message}`);
        logger.warn('⚠️  Falling back to local-only mode');
        logger.info('   Screenshots will not be uploaded to cloud');
        testRunner = null;
      }
    }

    if (!isTdd && !hasToken) {
      // Use output module methods for clean formatting
      let out = logger.print ? logger : null;
      if (out) {
        out.blank();
        out.warn('No TDD server or API token found');
        out.blank();
        out.print('  To capture screenshots, you need either:');
        out.blank();
        out.print('  1. Start TDD server first (recommended for local dev):');
        out.hint('     vizzly tdd start');
        out.hint('     npx vizzly static-site ./dist');
        out.blank();
        out.print('  2. Or set VIZZLY_TOKEN for cloud uploads:');
        out.hint('     VIZZLY_TOKEN=your-token npx vizzly static-site ./dist');
        out.blank();
      } else {
        // Fallback for testing or when output module not available
        logger.warn('No TDD server or API token found');
        logger.info('Run "vizzly tdd start" first, or set VIZZLY_TOKEN');
      }
      return;
    }

    // Start HTTP server to serve static site files
    serverInfo = await startStaticServer(config.buildPath);

    // Discover pages
    let pages = await discoverPages(config.buildPath, config);
    logger.info(`🌐 Found ${pages.length} pages in ${config.buildPath}`);

    if (pages.length === 0) {
      logger.warn('⚠️  No pages found');
      return;
    }

    // Launch browser and create tab pool
    browser = await launchBrowser(config.browser);
    pool = createTabPool(browser, config.concurrency);

    // Generate all tasks upfront (pages × viewports)
    let tasks = generateTasks(pages, serverInfo.url, config);
    logger.info(
      `📸 Processing ${tasks.length} screenshots (${config.concurrency} concurrent tabs)`
    );

    // Process all tasks through the tab pool
    let errors = await processAllTasks(tasks, pool, config, logger);

    // Report summary
    if (errors.length > 0) {
      logger.warn(`\n⚠️  ${errors.length} screenshot(s) failed:`);
      errors.forEach(({ page, viewport, error }) => {
        logger.error(`   ${page}@${viewport}: ${error}`);
      });
    } else {
      logger.info(`\n✅ Captured ${tasks.length} screenshots successfully`);
    }

    // Finalize build in run mode
    if (testRunner && buildId) {
      let executionTime = Date.now() - startTime;
      await testRunner.finalizeBuild(buildId, false, true, executionTime);

      if (buildUrl) {
        logger.info(`🔗 View results: ${buildUrl}`);
      }
    }
  } catch (error) {
    logger.error('Failed to process pages:', error.message);

    // Mark build as failed if in run mode
    if (testRunner && buildId) {
      try {
        let executionTime = startTime ? Date.now() - startTime : 0;
        await testRunner.finalizeBuild(buildId, false, false, executionTime);
      } catch {
        // Ignore finalization errors
      }
    }

    throw error;
  } finally {
    // Cleanup: drain pool first, then close browser
    if (pool) {
      await pool.drain();
    }
    if (browser) {
      await closeBrowser(browser);
    }
    if (serverInfo) {
      await stopStaticServer(serverInfo);
    }
    if (serverManager) {
      try {
        await serverManager.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }
}

/**
 * Configuration helper function for vizzly.config.js
 * Returns a configuration object for the static-site SDK
 * @param {Object} options - Configuration options
 * @returns {Object} Configuration object
 */
export function staticSite(options = {}) {
  return {
    name: 'static-site',
    ...options,
  };
}

/**
 * Programmatic API export
 * Allows users to run static site screenshot capture programmatically
 */
export { run as default };
