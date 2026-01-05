#!/usr/bin/env node
/**
 * Vizzly Browser Launcher
 *
 * Custom browser launcher spawned by Testem. Uses Playwright to launch
 * a browser with screenshot capture capabilities.
 *
 * Usage: vizzly-browser <browser> <url>
 *   browser: chromium | firefox | webkit
 *   url: The test page URL (provided by Testem)
 *
 * @example
 * # Testem spawns this command:
 * npx vizzly-browser chromium http://localhost:7357/tests/index.html
 */

import { closeBrowser, launchBrowser } from '../src/launcher/browser.js';
import {
  getServerInfo,
  setPage,
  startSnapshotServer,
  stopSnapshotServer,
} from '../src/launcher/snapshot-server.js';

let [, , browserType, testUrl] = process.argv;

// Validate arguments
if (!browserType || !testUrl) {
  console.error('Usage: vizzly-browser <browser> <url>');
  console.error('  browser: chromium | firefox | webkit');
  console.error('  url: Test page URL (provided by Testem)');
  process.exit(1);
}

let browserInstance = null;
let snapshotServer = null;
let isShuttingDown = false;

/**
 * Clean up resources and exit
 */
async function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    if (browserInstance) {
      await closeBrowser(browserInstance);
    }
  } catch {
    // Ignore cleanup errors
  }

  try {
    if (snapshotServer) {
      await stopSnapshotServer(snapshotServer);
    }
  } catch {
    // Ignore cleanup errors
  }

  process.exit(0);
}

/**
 * Main launcher function
 */
async function main() {
  try {
    // 1. Start snapshot server first (this also discovers the TDD server and caches its config)
    snapshotServer = await startSnapshotServer();
    let snapshotUrl = `http://127.0.0.1:${snapshotServer.port}`;

    // 2. Determine failOnDiff: env var > server.json > default (false)
    // getServerInfo() returns cached info from the TDD server discovery that happened above
    let failOnDiff = false;
    if (process.env.VIZZLY_FAIL_ON_DIFF === 'true' || process.env.VIZZLY_FAIL_ON_DIFF === '1') {
      failOnDiff = true;
    } else {
      let serverInfo = getServerInfo();
      if (serverInfo?.failOnDiff) {
        failOnDiff = true;
      }
    }

    // 3. Launch browser with Playwright
    // Note: We set the page reference in launchBrowser before navigation
    // to avoid a race condition where tests run before page is set
    browserInstance = await launchBrowser(browserType, testUrl, {
      snapshotUrl,
      failOnDiff,
      onPageCreated: page => {
        // Set page reference immediately when page is created
        // This happens BEFORE navigation so tests can capture screenshots
        setPage(page);

        // Listen for page close - this means browser was closed
        page.on('close', cleanup);
      },
    });

    // 3. Monitor for test completion
    // Hook into the test framework (QUnit or Mocha) to detect when tests finish
    let { page } = browserInstance;

    // Wait for a test framework to be available, then hook into its completion
    await page.evaluate(() => {
      return new Promise(resolve => {
        let checkFramework = () => {
          // Check for QUnit
          if (typeof QUnit !== 'undefined') {
            QUnit.done(() => {
              console.log('[testem-vizzly] all-tests-complete');
            });
            resolve();
            return;
          }

          // Check for Mocha
          if (typeof Mocha !== 'undefined' || typeof mocha !== 'undefined') {
            let Runner = (typeof Mocha !== 'undefined' ? Mocha : mocha).Runner;
            let originalEmit = Runner.prototype.emit;
            Runner.prototype.emit = function (evt) {
              if (evt === 'end') {
                console.log('[testem-vizzly] all-tests-complete');
              }
              return originalEmit.apply(this, arguments);
            };
            resolve();
            return;
          }

          // Keep checking until a framework is found
          requestAnimationFrame(checkFramework);
        };
        checkFramework();
      });
    });

    // Listen for the completion signal
    page.on('console', msg => {
      if (msg.text() === '[testem-vizzly] all-tests-complete') {
        cleanup();
      }
    });

    // 4. Keep process alive until cleanup is called
    await new Promise(() => {});
  } catch (error) {
    console.error('[vizzly-browser] Failed to start:', error.message);

    // Attempt cleanup before exiting
    if (snapshotServer) {
      await stopSnapshotServer(snapshotServer).catch(() => {});
    }

    process.exit(1);
  }
}

// Handle graceful shutdown signals from Testem
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGHUP', cleanup);

// Handle unexpected errors
process.on('uncaughtException', error => {
  console.error('[vizzly-browser] Uncaught exception:', error.message);
  cleanup();
});

process.on('unhandledRejection', reason => {
  console.error('[vizzly-browser] Unhandled rejection:', reason);
  cleanup();
});

main();
