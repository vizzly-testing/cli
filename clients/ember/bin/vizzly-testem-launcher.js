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
  startSnapshotServer,
  stopSnapshotServer,
} from '../src/launcher/snapshot-server.js';

// Parse arguments - format: vizzly-testem-launcher <browser> <url>
// Testem appends the URL as the last argument
let args = process.argv.slice(2);
let browserType = args[0];
let testUrl = args[args.length - 1];

// Validate arguments
if (!browserType || !testUrl || !testUrl.startsWith('http')) {
  console.error('Usage: vizzly-testem-launcher <browser> <url>');
  console.error('  browser: chromium | firefox | webkit');
  console.error('  url: Test page URL (provided by Testem)');
  process.exit(1);
}

// Read Playwright launch options from config file (written by configure())
let playwrightOptions = { headless: true }; // Default to headless
let configPath = join(process.cwd(), '.vizzly', 'playwright.json');
if (existsSync(configPath)) {
  try {
    playwrightOptions = {
      headless: true, // Default
      ...JSON.parse(readFileSync(configPath, 'utf8')),
    };
  } catch (err) {
    console.warn('[vizzly] Failed to read playwright.json:', err.message);
  }
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
    browserInstance = await launchBrowser(browserType, testUrl, {
      snapshotUrl,
      failOnDiff,
      playwrightOptions,
      onPageCreated: page => {
        setPage(page);
        page.on('close', cleanup);
      },
    });

    // 4. Monitor for test completion
    let { page } = browserInstance;

    // Wait for a test framework to be available, then hook into its completion
    await page.evaluate(() => {
      return new Promise(resolve => {
        let checkFramework = () => {
          // Check for QUnit
          if (typeof QUnit !== 'undefined') {
            QUnit.done(() => {
              console.log('[vizzly-testem] tests-complete');
            });
            resolve();
            return;
          }

          // Check for Mocha
          if (typeof Mocha !== 'undefined' || typeof mocha !== 'undefined') {
            let Runner = (typeof Mocha !== 'undefined' ? Mocha : mocha).Runner;
            let originalEmit = Runner.prototype.emit;
            Runner.prototype.emit = function (...args) {
              if (args[0] === 'end') {
                console.log('[vizzly-testem] tests-complete');
              }
              return originalEmit.apply(this, args);
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
      if (msg.text() === '[vizzly-testem] tests-complete') {
        cleanup();
      }
    });

    // 5. Keep process alive until cleanup is called
    await new Promise(() => {});
  } catch (error) {
    console.error('[vizzly-testem-launcher] Failed to start:', error.message);

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
  console.error('[vizzly-testem-launcher] Uncaught exception:', error.message);
  cleanup();
});

process.on('unhandledRejection', reason => {
  console.error('[vizzly-testem-launcher] Unhandled rejection:', reason);
  cleanup();
});

main();
