/**
 * Browser management with Playwright
 * Core functions for launching and managing browsers
 */

import { chromium, firefox, webkit } from 'playwright-core';

let browsers = { chromium, firefox, webkit };

/**
 * Launch a Playwright browser instance
 * @param {Object} options - Browser launch options
 * @param {'chromium' | 'firefox' | 'webkit'} [options.type='chromium'] - Browser type
 * @param {boolean} [options.headless=true] - Run in headless mode
 * @param {Array<string>} [options.args=[]] - Additional browser arguments
 * @returns {Promise<Object>} Browser instance
 */
export async function launchBrowser(options = {}) {
  let { type = 'chromium', headless = true, args = [] } = options;

  let browserType = browsers[type];
  if (!browserType) {
    throw new Error(
      `Unknown browser type: ${type}. Supported browsers: chromium, firefox, webkit`
    );
  }

  // Chromium-specific args for CI/containers and screenshot consistency
  let launchArgs =
    type === 'chromium'
      ? [
          // Required for running in containers/CI
          '--no-sandbox',
          '--disable-setuid-sandbox',

          // Reduce memory usage
          '--disable-dev-shm-usage',

          // Disable unnecessary features
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',

          // Disable features via --disable-features (modern approach)
          '--disable-features=Translate,OptimizationHints,MediaRouter',

          // Reduce resource usage
          '--metrics-recording-only',
          '--no-first-run',

          // Screenshot consistency
          '--hide-scrollbars',
          '--mute-audio',
          '--force-color-profile=srgb',

          // Memory optimizations
          '--js-flags=--max-old-space-size=512',

          // User-provided args
          ...args,
        ]
      : args;

  try {
    let browser = await browserType.launch({
      headless,
      args: launchArgs,
    });

    return browser;
  } catch (error) {
    // Check if this is a missing browser error
    if (
      error.message.includes("Executable doesn't exist") ||
      error.message.includes('browserType.launch')
    ) {
      let installCmd =
        type === 'chromium'
          ? 'npx playwright install chromium'
          : `npx playwright install ${type}`;

      throw new Error(
        `Browser "${type}" is not installed.\n\n` +
          `To fix this, run:\n` +
          `  ${installCmd}\n\n` +
          `For CI environments, add this step before running Vizzly:\n` +
          `  ${installCmd} --with-deps\n\n` +
          `You can cache the browser installation in CI for faster builds.\n` +
          `See: https://playwright.dev/docs/ci`
      );
    }

    throw error;
  }
}

/**
 * Close a browser instance
 * @param {Object} browser - Browser instance to close
 * @returns {Promise<void>}
 */
export async function closeBrowser(browser) {
  if (browser) {
    await browser.close();
  }
}

/**
 * Navigate to a URL and wait for the page to load
 * @param {Object} page - Playwright page instance
 * @param {string} url - URL to navigate to
 * @param {Object} [options] - Navigation options
 * @returns {Promise<void>}
 */
export async function navigateToUrl(page, url, options = {}) {
  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
      ...options,
    });
  } catch (error) {
    // Fallback to domcontentloaded if networkidle times out
    if (
      error.message.includes('timeout') ||
      error.message.includes('Timeout')
    ) {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
        ...options,
      });
    } else {
      throw error;
    }
  }
}
