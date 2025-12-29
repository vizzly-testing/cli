/**
 * Browser management with Puppeteer
 * Functions for launching, managing, and closing browsers
 */

import puppeteer from 'puppeteer';
import { setViewport } from './utils/viewport.js';

/**
 * Check if running in a CI environment
 * @returns {boolean}
 */
function isCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.JENKINS_HOME ||
    process.env.CIRCLECI ||
    process.env.GITLAB_CI ||
    process.env.BUILDKITE
  );
}

/**
 * Base browser args required for headless operation
 */
let BASE_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

/**
 * Additional browser args optimized for CI environments
 * These reduce memory usage and improve stability in resource-constrained environments
 */
let CI_OPTIMIZED_ARGS = [
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

  // Memory optimizations
  '--js-flags=--max-old-space-size=1024', // Limit V8 heap (1GB for larger Storybooks)
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

  let browserArgs = isCI()
    ? [...BASE_ARGS, ...CI_OPTIMIZED_ARGS, ...args]
    : [...BASE_ARGS, ...args];

  let browser = await puppeteer.launch({
    headless,
    args: browserArgs,
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
      timeout: 30000,
      ...options,
    });
  } catch (error) {
    // Fallback to domcontentloaded if networkidle2 times out
    let isTimeout =
      error.name === 'TimeoutError' ||
      error.message.includes('timeout') ||
      error.message.includes('Navigation timeout');

    if (isTimeout) {
      console.warn(
        `Navigation timeout for ${url}, falling back to domcontentloaded`
      );
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

  // Navigate to story (waits for networkidle2)
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
