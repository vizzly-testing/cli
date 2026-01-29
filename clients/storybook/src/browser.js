/**
 * Browser management with Puppeteer
 * Core functions for launching and managing browsers
 */

import puppeteer from 'puppeteer';

/**
 * Browser args optimized for stability and consistency
 * These are used in both local dev and CI to ensure identical behavior.
 * Disabling GPU, extensions, etc. reduces flakiness and memory usage.
 */
let CI_OPTIMIZED_ARGS = [
  // Required for running in containers/CI
  '--no-sandbox',
  '--disable-setuid-sandbox',

  // Reduce memory usage
  '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm (often too small in Docker)
  '--disable-gpu', // No GPU in CI
  '--disable-software-rasterizer',

  // Disable unnecessary features
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad', // Crash reporting
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--disable-translate',

  // Reduce resource usage
  '--metrics-recording-only',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',

  // Memory optimizations (1GB for larger Storybooks)
  '--js-flags=--max-old-space-size=1024',
];

/**
 * Launch a Puppeteer browser instance
 * @param {Object} options - Browser launch options
 * @param {boolean} [options.headless=true] - Run in headless mode
 * @param {Array<string>} [options.args=[]] - Additional browser arguments
 * @returns {Promise<Object>} Browser instance
 */
export async function launchBrowser(options = {}) {
  let { headless = true, args = [] } = options;

  let browser = await puppeteer.launch({
    headless,
    args: [...CI_OPTIMIZED_ARGS, ...args],
    // Reduce protocol timeout for faster failure detection
    protocolTimeout: 60_000, // 60s instead of default 180s
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
 * @param {Object} page - Puppeteer page instance
 * @param {string} url - URL to navigate to
 * @param {Object} [options] - Navigation options
 * @returns {Promise<void>}
 */
export async function navigateToUrl(page, url, options = {}) {
  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
      ...options,
    });
  } catch (error) {
    // Fallback to domcontentloaded if networkidle2 times out
    if (
      error.message.includes('timeout') ||
      error.message.includes('Navigation timeout')
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
