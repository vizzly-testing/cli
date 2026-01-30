/**
 * Browser management with Playwright
 * Core functions for launching and managing browsers
 */

import { chromium } from 'playwright-core';

/**
 * Launch a Playwright browser instance
 * @param {Object} options - Browser launch options
 * @param {boolean} [options.headless=true] - Run in headless mode
 * @param {Array<string>} [options.args=[]] - Additional browser arguments
 * @returns {Promise<Object>} Browser instance
 */
export async function launchBrowser(options = {}) {
  let { headless = true, args = [] } = options;

  let browser = await chromium.launch({
    headless,
    args: [
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
    ],
  });

  return browser;
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
