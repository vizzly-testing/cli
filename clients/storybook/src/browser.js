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
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 30000, // 30 second timeout
    ...options,
  });
}

/**
 * Wait for story to be ready
 * Storybook stories may need time to render
 * @param {Object} page - Puppeteer page instance
 * @param {number} [delay=500] - Delay in milliseconds
 * @returns {Promise<void>}
 */
export async function waitForStoryReady(page, delay = 500) {
  // Wait for Storybook root element
  try {
    await page.waitForSelector('#storybook-root', { timeout: 5000 });
  } catch {
    // Fallback: just wait a bit if root element not found
  }

  // Additional delay to ensure animations/transitions complete
  await page.waitForTimeout(delay);
}

/**
 * Process a single story - navigate, wait, and prepare for screenshot
 * @param {Object} browser - Browser instance
 * @param {string} url - Story URL
 * @param {Object} viewport - Viewport configuration
 * @param {Function|null} beforeScreenshot - Optional hook to run before screenshot
 * @returns {Promise<Object>} Page instance ready for screenshot
 */
export async function prepareStoryPage(
  browser,
  url,
  viewport,
  beforeScreenshot = null
) {
  let page = await createPage(browser);

  // Set viewport
  await setViewport(page, viewport);

  // Navigate to story
  await navigateToUrl(page, url);

  // Wait for story to be ready
  await waitForStoryReady(page);

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
