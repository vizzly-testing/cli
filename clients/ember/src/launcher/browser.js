/**
 * Playwright browser lifecycle management
 *
 * Handles launching, configuring, and closing browsers via Playwright-core.
 * Injects the screenshot server URL into page context for test code access.
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
 * Get default Chromium args for stability
 * @returns {string[]}
 */
function getDefaultChromiumArgs() {
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
 * @param {string} options.screenshotUrl - URL of the screenshot HTTP server
 * @param {boolean} [options.failOnDiff] - Whether tests should fail on visual diffs
 * @param {Object} [options.playwrightOptions] - Playwright launch options (headless, slowMo, timeout, etc.)
 * @param {Function} [options.onPageCreated] - Callback when page is created (before navigation)
 * @param {Function} [options.onBrowserDisconnected] - Callback when browser disconnects unexpectedly
 * @returns {Promise<Object>} Browser instance with page reference
 */
export async function launchBrowser(browserType, testUrl, options = {}) {
  let {
    screenshotUrl,
    failOnDiff,
    playwrightOptions = {},
    onPageCreated,
    onBrowserDisconnected,
  } = options;

  let factory = browserFactories[browserType];
  if (!factory) {
    let validTypes = Object.keys(browserFactories).join(', ');
    throw new Error(
      `Unknown browser type: ${browserType}. Valid types: ${validTypes}`
    );
  }

  // Build args: our defaults + user's args (user can override)
  let args = [];
  if (browserType === 'chromium') {
    args = [...getDefaultChromiumArgs()];
  }

  // Merge user's args if provided
  if (playwrightOptions.args) {
    args.push(...playwrightOptions.args);
  }

  // Build Playwright launch options
  // User's playwrightOptions take precedence, but we ensure args are merged
  let launchOptions = {
    headless: true, // Default to headless
    ...playwrightOptions,
    args,
  };

  let browser = await factory.launch(launchOptions);

  // Listen for unexpected browser disconnection (crash, killed, etc.)
  if (onBrowserDisconnected) {
    browser.on('disconnected', onBrowserDisconnected);
  }

  let context = await browser.newContext();
  let page = await context.newPage();

  // Inject Vizzly config into page context BEFORE navigation
  await page.addInitScript(
    ({ screenshotUrl, failOnDiff }) => {
      window.__VIZZLY_SCREENSHOT_URL__ = screenshotUrl;
      window.__VIZZLY_FAIL_ON_DIFF__ = failOnDiff;
    },
    { screenshotUrl, failOnDiff }
  );

  // Call onPageCreated callback BEFORE navigation
  if (onPageCreated) {
    onPageCreated(page);
  }

  // Navigate to test URL and wait for load
  await page.goto(testUrl, {
    waitUntil: 'load',
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
