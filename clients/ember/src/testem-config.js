/**
 * Testem configuration wrapper for Vizzly visual testing
 *
 * Wraps Testem config to replace standard browser launchers with
 * Playwright-powered launchers that support screenshot capture.
 *
 * @module @vizzly-testing/ember/testem
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Remap browser names to Vizzly launcher names
 * @param {string[]} browsers - Array of browser names
 * @returns {string[]} Remapped browser names
 */
function remapBrowsers(browsers) {
  if (!Array.isArray(browsers)) return browsers;
  return browsers.map(browser => browserMappings[browser] || browser);
}

/**
 * Get the path to the launcher script
 * @returns {string} Absolute path to vizzly-testem-launcher.js
 */
function getLauncherPath() {
  // This file is at src/testem-config.js, launcher is at bin/vizzly-testem-launcher.js
  let currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, '..', 'bin', 'vizzly-testem-launcher.js');
}

/**
 * Create launcher definitions for Vizzly browsers
 * @returns {Object} Launcher configuration object
 */
function createLaunchers() {
  let launcherPath = getLauncherPath();

  return {
    VizzlyChrome: {
      exe: 'node',
      args: [launcherPath, 'chromium'],
      protocol: 'browser',
    },
    VizzlyFirefox: {
      exe: 'node',
      args: [launcherPath, 'firefox'],
      protocol: 'browser',
    },
    VizzlyWebKit: {
      exe: 'node',
      args: [launcherPath, 'webkit'],
      protocol: 'browser',
    },
  };
}

/**
 * Write Playwright options to config file for the launcher to read
 * @param {Object} options - Playwright launch options
 */
function writePlaywrightConfig(options) {
  if (!options || Object.keys(options).length === 0) return;

  let vizzlyDir = join(process.cwd(), '.vizzly');
  if (!existsSync(vizzlyDir)) {
    mkdirSync(vizzlyDir, { recursive: true });
  }

  let configPath = join(vizzlyDir, 'playwright.json');
  writeFileSync(configPath, JSON.stringify(options, null, 2));
}

/**
 * Wrap Testem configuration to enable Vizzly visual testing
 *
 * This function transforms a standard Testem configuration to use
 * Vizzly-powered browser launchers. It:
 * - Remaps Chrome/Firefox/Safari to VizzlyChrome/VizzlyFirefox/VizzlyWebKit
 * - Adds custom launcher definitions that use Playwright
 * - Preserves all other Testem configuration options
 *
 * The second argument accepts Playwright browserType.launch() options directly.
 * See: https://playwright.dev/docs/api/class-browsertype#browser-type-launch
 *
 * @param {Object} userConfig - User's testem.js configuration
 * @param {Object} [playwrightOptions] - Playwright launch options passed directly to browserType.launch()
 * @param {boolean} [playwrightOptions.headless=true] - Run browser in headless mode
 * @param {number} [playwrightOptions.slowMo] - Slow down operations by this many milliseconds
 * @param {number} [playwrightOptions.timeout] - Browser launch timeout in milliseconds
 * @param {Object} [playwrightOptions.proxy] - Proxy settings
 * @returns {Object} Modified configuration with Vizzly launchers
 *
 * @example
 * // testem.js - Basic usage (headless by default)
 * const { configure } = require('@vizzly-testing/ember');
 *
 * module.exports = configure({
 *   test_page: 'tests/index.html?hidepassed',
 *   launch_in_ci: ['Chrome'],
 *   launch_in_dev: ['Chrome'],
 * });
 *
 * @example
 * // Headed mode for local debugging
 * const isCI = process.env.CI;
 *
 * module.exports = configure({
 *   launch_in_ci: ['Chrome'],
 *   launch_in_dev: ['Chrome'],
 * }, {
 *   headless: isCI,  // Headed locally, headless in CI
 * });
 *
 * @example
 * // With debugging options
 * module.exports = configure({
 *   launch_in_ci: ['Chrome'],
 * }, {
 *   headless: false,
 *   slowMo: 100,     // Slow down for debugging
 *   timeout: 60000,  // Longer timeout
 * });
 */
export function configure(userConfig = {}, playwrightOptions = {}) {
  let config = { ...userConfig };

  // Write Playwright options to file for launcher to read
  writePlaywrightConfig(playwrightOptions);

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

export { browserMappings };
