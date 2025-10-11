/**
 * Browser management with Puppeteer
 * Functions for launching, managing, and closing browsers
 */

import puppeteer from 'puppeteer';
import { setViewport } from './utils/viewport.js';

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
    args: ['--no-sandbox', '--disable-setuid-sandbox', ...args],
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
 * Create a new page in the browser
 * @param {Object} browser - Browser instance
 * @returns {Promise<Object>} Page instance
 */
export async function createPage(browser) {
  return await browser.newPage();
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
      timeout: 30000, // 30 second timeout
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

/**
 * Process a single page - navigate, wait, and prepare for screenshot
 * @param {Object} browser - Browser instance
 * @param {string} url - Page URL
 * @param {Object} viewport - Viewport configuration
 * @param {Function|null} beforeScreenshot - Optional hook to run before screenshot
 * @returns {Promise<Object>} Page instance ready for screenshot
 */
export async function preparePageForScreenshot(
  browser,
  url,
  viewport,
  beforeScreenshot = null
) {
  let page = await createPage(browser);

  // Set viewport
  await setViewport(page, viewport);

  // Navigate to page (waits for networkidle2)
  await navigateToUrl(page, url);

  // Run custom interaction hook if provided
  if (beforeScreenshot && typeof beforeScreenshot === 'function') {
    await beforeScreenshot(page);
  }

  return page;
}

/**
 * Close a page
 * @param {Object} page - Page instance to close
 * @returns {Promise<void>}
 */
export async function closePage(page) {
  if (page) {
    await page.close();
  }
}
