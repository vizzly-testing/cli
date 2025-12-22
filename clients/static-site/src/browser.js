/**
 * Browser management with Puppeteer
 * Core functions for launching and managing browsers
 */

import puppeteer from 'puppeteer';

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
