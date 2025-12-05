/**
 * Main entry point for @vizzly-testing/storybook
 * Functional orchestration of story discovery and screenshot capture
 */

import {
  closeBrowser,
  closePage,
  launchBrowser,
  prepareStoryPage,
} from './browser.js';
import { loadConfig } from './config.js';
import { discoverStories, generateStoryUrl } from './crawler.js';
import { getBeforeScreenshotHook, getStoryConfig } from './hooks.js';
import { captureAndSendScreenshot } from './screenshot.js';
import { startStaticServer, stopStaticServer } from './server.js';

/**
 * Process a single story across all configured viewports
 * @param {Object} story - Story object
 * @param {Object} browser - Browser instance
 * @param {string} baseUrl - Base URL for Storybook (HTTP server)
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<Object>} Result object with success count and errors
 */
async function processStory(story, browser, baseUrl, config, context) {
  let { logger } = context;
  let storyConfig = getStoryConfig(story, config);
  let storyUrl = generateStoryUrl(baseUrl, story.id);
  let hook = getBeforeScreenshotHook(story, config);
  let errors = [];

  // Process each viewport for this story
  for (let viewport of storyConfig.viewports) {
    let page = null;

    try {
      page = await prepareStoryPage(browser, storyUrl, viewport, hook);
      await captureAndSendScreenshot(
        page,
        story,
        viewport,
        storyConfig.screenshot
      );

      logger.info(`   ✓ ${story.title}/${story.name}@${viewport.name}`);
    } catch (error) {
      logger.error(
        `   ✗ ${story.title}/${story.name}@${viewport.name}: ${error.message}`
      );
      errors.push({
        story: `${story.title}/${story.name}`,
        viewport: viewport.name,
        error: error.message,
      });
    } finally {
      await closePage(page);
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
  let executing = [];

  for (let item of items) {
    let promise = fn(item).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
}

/**
 * Process all stories with concurrency control
 * @param {Array<Object>} stories - Array of story objects
 * @param {Object} browser - Browser instance
 * @param {string} baseUrl - Base URL for Storybook (HTTP server)
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<Array>} Array of all errors encountered
 */
async function processStories(stories, browser, baseUrl, config, context) {
  let allErrors = [];

  await mapWithConcurrency(
    stories,
    async story => {
      let { errors } = await processStory(
        story,
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
 * @param {string} storybookPath - Path to static Storybook build
 * @param {Object} options - CLI options
 * @param {Object} context - Plugin context (logger, config, services)
 * @returns {Promise<void>}
 */
export async function run(storybookPath, options = {}, context = {}) {
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
    let config = await loadConfig(storybookPath, options, vizzlyConfig);

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
          ? await gitUtils.generateBuildNameWithGit('Storybook')
          : `Storybook ${new Date().toISOString()}`;
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
        testRunner = null;
      }
    }

    if (!isTdd && !hasToken) {
      logger.warn('⚠️  No TDD server or API token found');
      logger.info('   Run `vizzly tdd start` or set VIZZLY_TOKEN');
    }

    // Start HTTP server to serve Storybook static files
    serverInfo = await startStaticServer(config.storybookPath);

    // Discover stories
    let stories = await discoverStories(config.storybookPath, config);
    logger.info(
      `📚 Found ${stories.length} stories in ${config.storybookPath}`
    );

    if (stories.length === 0) {
      logger.warn('⚠️  No stories found');
      return;
    }

    // Launch browser
    browser = await launchBrowser(config.browser);

    // Process all stories
    let errors = await processStories(
      stories,
      browser,
      serverInfo.url,
      config,
      context
    );

    // Report summary
    if (errors.length > 0) {
      logger.warn(`\n⚠️  ${errors.length} screenshot(s) failed:`);
      errors.forEach(({ story, viewport, error }) => {
        logger.error(`   ${story}@${viewport}: ${error}`);
      });
    } else {
      logger.info(`\n✅ Captured ${stories.length} screenshots successfully`);
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
    logger.error('Failed to process stories:', error.message);

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
 * Programmatic API export
 * Allows users to run Storybook screenshot capture programmatically
 */
export { run as default };
