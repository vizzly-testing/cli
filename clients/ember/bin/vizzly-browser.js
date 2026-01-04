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
  } catch (error) {
    console.error('[vizzly-browser] Error closing browser:', error.message);
  }

  try {
    if (snapshotServer) {
      await stopSnapshotServer(snapshotServer);
    }
  } catch (error) {
    console.error('[vizzly-browser] Error stopping server:', error.message);
  }

  process.exit(0);
}

/**
 * Main launcher function
 */
async function main() {
  try {
    // 1. Start snapshot server first
    snapshotServer = await startSnapshotServer();
    let snapshotUrl = `http://127.0.0.1:${snapshotServer.port}`;

    // 2. Launch browser with Playwright
    // Note: We set the page reference in launchBrowser before navigation
    // to avoid a race condition where tests run before page is set
    browserInstance = await launchBrowser(browserType, testUrl, {
      snapshotUrl,
      onPageCreated: page => {
        // Set page reference immediately when page is created
        // This happens BEFORE navigation so tests can capture screenshots
        setPage(page);
      },
    });

    // 3. Keep process alive - Testem will send SIGTERM when done
    // The browser will run tests and the snapshot server will handle requests
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
