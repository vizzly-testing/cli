/**
 * Main entry point for @vizzly-testing/storybook
 * Functional orchestration of story discovery and screenshot capture
 * Uses a tab pool for efficient browser tab management
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { closeBrowser, launchBrowser } from './browser.js';
import { loadConfig } from './config.js';
import { discoverStories } from './crawler.js';
import { createTabPool } from './pool.js';
import { startStaticServer, stopStaticServer } from './server.js';
import { generateTasks, processAllTasks } from './tasks.js';

/**
 * Check if TDD mode is available
 * @returns {Promise<boolean>} True if TDD server is running
 */
async function isTddModeAvailable() {
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

export function buildCloudRunOptions(vizzlyConfig = {}, gitInfo = {}) {
  let runOptions = {
    port: vizzlyConfig?.server?.port || 47392,
    timeout: vizzlyConfig?.server?.timeout || 30000,
    buildName:
      vizzlyConfig?.build?.name ||
      gitInfo.buildName ||
      `Storybook ${new Date().toISOString()}`,
    branch: gitInfo.branch || 'main',
    commit: gitInfo.commit,
    message: gitInfo.message,
    environment: vizzlyConfig?.build?.environment,
    eager: vizzlyConfig?.eager || false,
    allowNoToken: false,
    wait: false,
    uploadAll: false,
    pullRequestNumber: gitInfo.prNumber,
    parallelId: vizzlyConfig?.parallelId,
  };

  if (vizzlyConfig?.comparison?.threshold != null) {
    runOptions.threshold = vizzlyConfig.comparison.threshold;
  }

  if (vizzlyConfig?.comparison?.minClusterSize != null) {
    runOptions.minClusterSize = vizzlyConfig.comparison.minClusterSize;
  }

  return runOptions;
}

export function buildFinalizeSuccess(errors = []) {
  return errors.length === 0;
}

/**
 * Main run function - orchestrates the entire screenshot capture process
 * Uses a tab pool for efficient parallel screenshot capture
 * @param {string} storybookPath - Path to static Storybook build
 * @param {Object} options - CLI options
 * @param {Object} context - Plugin context (output, config, services)
 * @returns {Promise<void>}
 */
export async function run(storybookPath, options = {}, context = {}) {
  let {
    output: providedOutput,
    logger: legacyOutput,
    config: vizzlyConfig,
    services,
  } = context;
  let output = providedOutput || legacyOutput;
  let browser = null;
  let pool = null;
  let serverInfo = null;
  let testRunner = null;
  let serverManager = null;
  let buildId = null;
  let startTime = null;

  if (!output) {
    throw new Error(
      'Output utilities are required but were not provided in context'
    );
  }

  try {
    // Load and merge configuration
    let config = await loadConfig(storybookPath, options, vizzlyConfig);

    // Determine mode: TDD or Run
    let isTdd = await isTddModeAvailable();
    let hasToken = hasApiToken(vizzlyConfig);

    if (isTdd) {
      output.info('📍 TDD mode: Using local server');
    } else if (hasToken) {
      output.info('☁️  Run mode: Uploading to cloud');
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
            output.info(`🔗 ${buildInfo.url}`);
          }
        });

        // Detect git info using CLI's plugin API (preferred) or fallback to env vars
        let gitInfo;

        if (services.git?.detect) {
          // Use CLI's git detection (correct handling of CI environments)
          gitInfo = await services.git.detect({ buildPrefix: 'Storybook' });
        } else {
          // Fallback for older CLI versions - use environment variables
          output.warn(
            '⚠️  Upgrade to @vizzly-testing/cli@>=0.25.0 for improved git detection'
          );
          gitInfo = {
            branch: process.env.VIZZLY_BRANCH || 'main',
            commit: process.env.VIZZLY_COMMIT_SHA || undefined,
            message: process.env.VIZZLY_COMMIT_MESSAGE || undefined,
            buildName: `Storybook ${new Date().toISOString()}`,
            prNumber: process.env.VIZZLY_PR_NUMBER
              ? parseInt(process.env.VIZZLY_PR_NUMBER, 10)
              : undefined,
          };
        }

        // Build options for API
        let runOptions = buildCloudRunOptions(vizzlyConfig, gitInfo);

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
        output.error(`Failed to initialize cloud mode: ${error.message}`);
        output.warn('⚠️  Falling back to local-only mode');
        output.info('   Screenshots will not be uploaded to cloud');
        testRunner = null;
      }
    }

    if (!isTdd && !hasToken) {
      output.warn('⚠️  No TDD server or API token found');
      output.info('   Run `vizzly tdd start` or set VIZZLY_TOKEN');
    }

    // Start HTTP server to serve Storybook static files
    serverInfo = await startStaticServer(config.storybookPath);

    // Discover stories
    let stories = await discoverStories(config.storybookPath, config);
    output.info(
      `📚 Found ${stories.length} stories in ${config.storybookPath}`
    );

    if (stories.length === 0) {
      output.warn('⚠️  No stories found');
      if (testRunner && buildId) {
        let executionTime = Date.now() - startTime;
        await testRunner.finalizeBuild(buildId, false, true, executionTime);
      }
      return;
    }

    // Launch browser and create tab pool
    browser = await launchBrowser(config.browser);
    pool = createTabPool(browser, config.concurrency);

    // Generate all tasks upfront (stories × viewports)
    let tasks = generateTasks(stories, serverInfo.url, config);
    output.info(
      `📸 Processing ${tasks.length} screenshots (${config.concurrency} concurrent tabs)`
    );

    // Process all tasks through the tab pool
    let errors = await processAllTasks(tasks, pool, config, output);

    // Report summary
    if (errors.length > 0) {
      output.warn(`\n⚠️  ${errors.length} screenshot(s) failed:`);
      errors.forEach(({ story, viewport, error }) => {
        output.error(`   ${story}@${viewport}: ${error}`);
      });
    }

    // Finalize build in run mode
    if (testRunner && buildId) {
      let executionTime = Date.now() - startTime;
      await testRunner.finalizeBuild(
        buildId,
        false,
        buildFinalizeSuccess(errors),
        executionTime
      );

      if (buildUrl) {
        output.info(`🔗 View results: ${buildUrl}`);
      }
    }
  } catch (error) {
    output.error('Failed to process stories:', error.message);

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
 * Programmatic API export
 * Allows users to run Storybook screenshot capture programmatically
 */
export { run as default };
