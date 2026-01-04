/**
 * Testem configuration wrapper for Vizzly visual testing
 *
 * Wraps Testem config to replace standard browser launchers with
 * Playwright-powered launchers that support screenshot capture.
 *
 * @module @vizzly-testing/ember/testem
 */

/**
 * Browser name mappings from user-friendly names to Vizzly launchers
 */
let browserMappings = {
  Chrome: 'VizzlyChrome',
  chrome: 'VizzlyChrome',
  Firefox: 'VizzlyFirefox',
  firefox: 'VizzlyFirefox',
  Safari: 'VizzlyWebKit',
  safari: 'VizzlyWebKit',
  WebKit: 'VizzlyWebKit',
  webkit: 'VizzlyWebKit',
};

/**
 * Playwright browser type for each Vizzly launcher
 */
let launcherBrowserTypes = {
  VizzlyChrome: 'chromium',
  VizzlyFirefox: 'firefox',
  VizzlyWebKit: 'webkit',
};

/**
 * Remap browser names to Vizzly launcher names
 * @param {string[]} browsers - Array of browser names
 * @returns {string[]} Remapped browser names
 */
function remapBrowsers(browsers) {
  if (!Array.isArray(browsers)) return browsers;
  return browsers.map(browser => browserMappings[browser] || browser);
}

/**
 * Create launcher definitions for Vizzly browsers
 * Testem automatically appends the test URL to the args array
 * @returns {Object} Launcher configuration object
 */
function createLaunchers() {
  return {
    VizzlyChrome: {
      exe: 'npx',
      args: ['vizzly-browser', 'chromium'],
      protocol: 'browser',
    },
    VizzlyFirefox: {
      exe: 'npx',
      args: ['vizzly-browser', 'firefox'],
      protocol: 'browser',
    },
    VizzlyWebKit: {
      exe: 'npx',
      args: ['vizzly-browser', 'webkit'],
      protocol: 'browser',
    },
  };
}

/**
 * Wrap Testem configuration to enable Vizzly visual testing
 *
 * This function transforms a standard Testem configuration to use
 * Vizzly-powered browser launchers. It:
 * - Remaps Chrome/Firefox/Safari to VizzlyChrome/VizzlyFirefox/VizzlyWebKit
 * - Adds custom launcher definitions that use Playwright
 * - Preserves all other configuration options
 *
 * @param {Object} userConfig - User's testem.js configuration
 * @returns {Object} Modified configuration with Vizzly launchers
 *
 * @example
 * // testem.js
 * const { configure } = require('@vizzly-testing/ember');
 *
 * module.exports = configure({
 *   test_page: 'tests/index.html?hidepassed',
 *   launch_in_ci: ['Chrome'],
 *   launch_in_dev: ['Chrome'],
 *   browser_args: {
 *     Chrome: { ci: ['--headless', '--no-sandbox'] }
 *   }
 * });
 */
export function configure(userConfig = {}) {
  let config = { ...userConfig };

  // Remap browser lists to use Vizzly launchers
  if (config.launch_in_ci) {
    config.launch_in_ci = remapBrowsers(config.launch_in_ci);
  }

  if (config.launch_in_dev) {
    config.launch_in_dev = remapBrowsers(config.launch_in_dev);
  }

  // Add Vizzly launcher definitions
  config.launchers = {
    ...config.launchers,
    ...createLaunchers(),
  };

  return config;
}

export { browserMappings, launcherBrowserTypes };
