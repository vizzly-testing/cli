#!/usr/bin/env node
/**
 * Vizzly Testem Launcher
 *
 * Custom Testem launcher that uses Playwright to control browsers,
 * enabling screenshot capture for visual testing.
 *
 * Usage: vizzly-testem-launcher <browser> <url>
 *   browser: chromium | firefox | webkit
 *   url: The test page URL (provided by Testem)
 *
 * Playwright launch options are read from .vizzly/playwright.json
 * (written by configure() in testem-config.js)
 *
 * @example
 * # Testem spawns this command:
 * node vizzly-testem-launcher.js chromium http://localhost:7357/tests
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeBrowser, launchBrowser } from '../src/launcher/browser.js';
import {
  getServerInfo,
  setPage,
  startScreenshotServer,
  stopScreenshotServer,
} from '../src/launcher/screenshot-server.js';

// Parse arguments - format: vizzly-testem-launcher <browser> <url>
// Testem appends the URL as the last argument
let args = process.argv.slice(2);
let browserType = args[0];
let testUrl = args[args.length - 1];

// If using remote browser (Docker), rewrite localhost to host.docker.internal
// so the containerized browser can reach the host's test server
function rewriteUrlForDocker(url) {
  return url.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
}

// Validate arguments
if (!browserType || !testUrl || !testUrl.startsWith('http')) {
  console.error('Usage: vizzly-testem-launcher <browser> <url>');
  console.error('  browser: chromium | firefox | webkit');
  console.error('  url: Test page URL (provided by Testem)');
  process.exit(1);
}

// Read Playwright launch options from config file (written by configure())
let playwrightOptions = { headless: true }; // Default to headless
let browserWSEndpoint = null;
let configPath = join(process.cwd(), '.vizzly', 'playwright.json');
if (existsSync(configPath)) {
  try {
    let config = JSON.parse(readFileSync(configPath, 'utf8'));
    // Extract browserWSEndpoint separately (not a Playwright launch option)
    browserWSEndpoint = config.browserWSEndpoint;
    delete config.browserWSEndpoint;
    playwrightOptions = {
      headless: true, // Default
      ...config,
    };
  } catch (err) {
    console.warn('[vizzly] Failed to read playwright.json:', err.message);
  }
}

let browserInstance = null;
let screenshotServer = null;
let isShuttingDown = false;

/**
 * Clean up resources and exit
 * @param {string} reason - Why cleanup was triggered
 * @param {number} exitCode - Process exit code (default 0)
 */
async function cleanup(reason = 'unknown', exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (process.env.VIZZLY_LOG_LEVEL === 'debug') {
    console.error(`[vizzly-testem-launcher] Cleanup triggered: ${reason}`);
  }

  try {
    if (browserInstance) {
      await closeBrowser(browserInstance);
    }
  } catch {
    // Ignore cleanup errors
  }

  try {
    if (screenshotServer) {
      await stopScreenshotServer(screenshotServer);
    }
  } catch {
    // Ignore cleanup errors
  }

  process.exit(exitCode);
}

/**
 * Main launcher function
 */
async function main() {
  try {
    // 1. Start screenshot server first (this also discovers the TDD server and caches its config)
    screenshotServer = await startScreenshotServer();
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    // 2. Determine failOnDiff: env var > server.json > default (false)
    let failOnDiff = false;
    if (process.env.VIZZLY_FAIL_ON_DIFF === 'true' || process.env.VIZZLY_FAIL_ON_DIFF === '1') {
      failOnDiff = true;
    } else {
      let serverInfo = getServerInfo();
      if (serverInfo?.failOnDiff) {
        failOnDiff = true;
      }
    }

    // 3. Launch browser with Playwright (or connect to remote browser)
    // If remote browser, rewrite URL so container can reach host
    let actualTestUrl = browserWSEndpoint ? rewriteUrlForDocker(testUrl) : testUrl;

    if (browserWSEndpoint) {
      console.log(`[vizzly] Connecting to remote browser: ${browserWSEndpoint}`);
      console.log(`[vizzly] Test URL rewritten: ${testUrl} -> ${actualTestUrl}`);
    }

    browserInstance = await launchBrowser(browserType, actualTestUrl, {
      screenshotUrl,
      failOnDiff,
      browserWSEndpoint,
      playwrightOptions,
      onPageCreated: page => {
        setPage(page);
        page.on('close', async () => await cleanup('page-close'));
      },
      onBrowserDisconnected: async () => await cleanup('browser-disconnected'),
    });

    // 4. Listen for browser crashes
    let { page } = browserInstance;
    page.on('crash', async () => {
      console.error('[vizzly-testem-launcher] Page crashed!');
      await cleanup('page-crash', 1);
    });

    // 5. Keep process alive until cleanup is called
    await new Promise(() => {});
  } catch (error) {
    console.error('[vizzly-testem-launcher] Failed to start:', error.message);
    console.error(error.stack);

    if (screenshotServer) {
      await stopScreenshotServer(screenshotServer).catch(() => {});
    }

    process.exit(1);
  }
}

// Handle graceful shutdown signals from Testem
process.on('SIGTERM', async () => await cleanup('SIGTERM'));
process.on('SIGINT', async () => await cleanup('SIGINT'));
process.on('SIGHUP', async () => await cleanup('SIGHUP'));

// Handle unexpected errors
process.on('uncaughtException', async error => {
  console.error('[vizzly-testem-launcher] Uncaught exception:', error.message);
  console.error(error.stack);
  await cleanup('uncaughtException', 1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('[vizzly-testem-launcher] Unhandled rejection at:', promise);
  console.error('[vizzly-testem-launcher] Reason:', reason);
  if (reason instanceof Error) {
    console.error(reason.stack);
  }
  await cleanup('unhandledRejection', 1);
});

main();
