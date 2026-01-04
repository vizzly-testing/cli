/**
 * Playwright browser lifecycle management
 *
 * Handles launching, configuring, and closing browsers via Playwright-core.
 * Injects the snapshot server URL into page context for test code access.
 *
 * @module @vizzly-testing/ember/launcher/browser
 */

import { chromium, firefox, webkit } from 'playwright-core';

/**
 * Map of browser type names to Playwright browser factories
 */
let browserFactories = {
  chromium,
  firefox,
  webkit,
};

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
    process.env.BUILDKITE ||
    process.env.TRAVIS
  );
}

/**
 * Get browser launch arguments for Chromium
 * @returns {string[]}
 */
function getChromiumArgs() {
  let args = ['--no-sandbox', '--disable-setuid-sandbox'];

  if (isCI()) {
    args.push(
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions'
    );
  }

  return args;
}

/**
 * Launch a browser and navigate to the test URL
 *
 * @param {string} browserType - Browser type: chromium, firefox, webkit
 * @param {string} testUrl - URL to navigate to (provided by Testem)
 * @param {Object} options - Launch options
 * @param {string} options.snapshotUrl - URL of the snapshot HTTP server
 * @param {boolean} [options.headless] - Run in headless mode (default: true in CI)
 * @param {Function} [options.onPageCreated] - Callback when page is created (before navigation)
 * @returns {Promise<Object>} Browser instance with page reference
 */
export async function launchBrowser(browserType, testUrl, options = {}) {
  let { snapshotUrl, headless, onPageCreated } = options;

  // Default headless based on CI environment
  if (headless === undefined) {
    headless = isCI();
  }

  let factory = browserFactories[browserType];
  if (!factory) {
    let validTypes = Object.keys(browserFactories).join(', ');
    throw new Error(
      `Unknown browser type: ${browserType}. Valid types: ${validTypes}`
    );
  }

  // Launch browser with appropriate args
  let launchOptions = {
    headless,
  };

  if (browserType === 'chromium') {
    launchOptions.args = getChromiumArgs();
  }

  let browser = await factory.launch(launchOptions);
  let context = await browser.newContext();
  let page = await context.newPage();

  // Inject snapshot URL into page context BEFORE navigation
  // This ensures window.__VIZZLY_SNAPSHOT_URL__ is available when tests run
  await page.addInitScript(url => {
    window.__VIZZLY_SNAPSHOT_URL__ = url;
  }, snapshotUrl);

  // Call onPageCreated callback BEFORE navigation
  // This allows setting up the page reference before tests can run
  if (onPageCreated) {
    onPageCreated(page);
  }

  // Navigate to test URL and wait for network to be idle
  await page.goto(testUrl, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });

  return { browser, context, page };
}

/**
 * Close a browser instance and clean up resources
 *
 * @param {Object} instance - Browser instance returned by launchBrowser
 * @returns {Promise<void>}
 */
export async function closeBrowser(instance) {
  if (instance?.browser) {
    await instance.browser.close();
  }
}
