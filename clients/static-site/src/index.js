/**
 * Main entry point for @vizzly-testing/static-site
 * Functional orchestration of page discovery and screenshot capture
 */

import {
  closeBrowser,
  closePage,
  launchBrowser,
  preparePageForScreenshot,
} from './browser.js';
import { getPageConfig, loadConfig } from './config.js';
import { discoverPages, generatePageUrl } from './crawler.js';
import { getBeforeScreenshotHook } from './hooks.js';
import { captureAndSendScreenshot } from './screenshot.js';
import { startStaticServer, stopStaticServer } from './server.js';

/**
 * Process a single page across all configured viewports
 * @param {Object} page - Page object
 * @param {Object} browser - Browser instance
 * @param {string} baseUrl - Base URL for static site (HTTP server)
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<Object>} Result object with success count and errors
 */
async function processPage(page, browser, baseUrl, config, context) {
  let { logger } = context;
  let pageConfig = getPageConfig(config, page);
  let pageUrl = generatePageUrl(baseUrl, page);
  let hook = getBeforeScreenshotHook(page, config);
  let errors = [];

  // Process each viewport for this page
  for (let viewport of pageConfig.viewports) {
    let puppeteerPage = null;

    try {
      puppeteerPage = await preparePageForScreenshot(
        browser,
        pageUrl,
        viewport,
        hook
      );
      await captureAndSendScreenshot(
        puppeteerPage,
        page,
        viewport,
        pageConfig.screenshot
      );

      logger.info(`   ✓ ${page.path}@${viewport.name}`);
    } catch (error) {
      logger.error(`   ✗ ${page.path}@${viewport.name}: ${error.message}`);
      errors.push({
        page: page.path,
        viewport: viewport.name,
        error: error.message,
      });
    } finally {
      await closePage(puppeteerPage);
    }
  }

  return { errors };
}

/**
 * Simple concurrency control - process items with limited parallelism
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to process each item
 * @param {number} concurrency - Max parallel operations
 * @returns {Promise<void>}
 */
async function mapWithConcurrency(items, fn, concurrency) {
  let results = [];
  let executing = new Set();

  for (let item of items) {
    let promise = fn(item).then(result => {
      executing.delete(promise);
      return result;
    });

    results.push(promise);
    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
}

/**
 * Process all pages with concurrency control
 * @param {Array<Object>} pages - Array of page objects
 * @param {Object} browser - Browser instance
 * @param {string} baseUrl - Base URL for static site (HTTP server)
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<Array>} Array of all errors encountered
 */
async function processPages(pages, browser, baseUrl, config, context) {
  let allErrors = [];

  await mapWithConcurrency(
    pages,
    async page => {
      let { errors } = await processPage(
        page,
        browser,
        baseUrl,
        config,
        context
      );
      allErrors.push(...errors);
    },
    config.concurrency
  );

  return allErrors;
}

/**
 * Check if TDD mode is available
 * @returns {Promise<boolean>} True if TDD server is running
 */
async function isTddModeAvailable() {
  let { existsSync, readFileSync } = await import('node:fs');
  let { join, parse, dirname } = await import('node:path');

  try {
    // Look for .vizzly/server.json
    let currentDir = process.cwd();
    let root = parse(currentDir).root;

    while (currentDir !== root) {
      let serverJsonPath = join(currentDir, '.vizzly', 'server.json');

      if (existsSync(serverJsonPath)) {
        try {
          let serverInfo = JSON.parse(readFileSync(serverJsonPath, 'utf8'));
          if (serverInfo.port) {
            // Try to ping the server
            let response = await fetch(
              `http://localhost:${serverInfo.port}/health`
            );
            return response.ok;
          }
        } catch {
          // Invalid JSON or server not responding
        }
      }
      currentDir = dirname(currentDir);
    }
  } catch {
    // Error checking for TDD mode
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
 * @param {string} buildPath - Path to static site build
 * @param {Object} options - CLI options
 * @param {Object} context - Plugin context (logger, config, services)
 * @returns {Promise<void>}
 */
export async function run(buildPath, options = {}, context = {}) {
  let { logger, config: vizzlyConfig, services } = context;
  let browser = null;
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

    // Determine mode: TDD or Run
    let isTdd = await isTddModeAvailable();
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
        testRunner = await services.get('testRunner');
        serverManager = await services.get('serverManager');
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
      logger.warn('⚠️  No TDD server or API token found');
      logger.info('   Run `vizzly tdd start` or set VIZZLY_TOKEN');
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

    // Launch browser
    browser = await launchBrowser(config.browser);

    // Process all pages
    let errors = await processPages(
      pages,
      browser,
      serverInfo.url,
      config,
      context
    );

    // Report summary
    if (errors.length > 0) {
      logger.warn(`\n⚠️  ${errors.length} screenshot(s) failed:`);
      errors.forEach(({ page, viewport, error }) => {
        logger.error(`   ${page}@${viewport}: ${error}`);
      });
    } else {
      logger.info(
        `\n✅ Captured ${pages.length * config.viewports.length} screenshots successfully`
      );
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
    // Cleanup
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
