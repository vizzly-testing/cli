/**
 * Configuration loading and merging for Storybook plugin
 * Pure functions for managing configuration
 * Reads from config.storybook section of main vizzly.config.js
 */

import { cpus } from 'node:os';
import { parseViewport } from './utils/viewport.js';

/**
 * Calculate sensible default concurrency
 * Uses half of CPU cores, capped at 8, minimum 2
 * Matches static-site SDK behavior
 */
function getDefaultConcurrency() {
  let cores = cpus().length;
  return Math.max(2, Math.min(8, Math.floor(cores / 2)));
}

/**
 * Default configuration values
 */
export let defaultConfig = {
  storybookPath: null,
  viewports: [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'desktop', width: 1920, height: 1080 },
  ],
  browser: {
    headless: true,
    args: [],
  },
  screenshot: {
    fullPage: false,
    omitBackground: false,
  },
  concurrency: getDefaultConcurrency(),
  include: null,
  exclude: null,
  interactions: {},
};

/**
 * Parse CLI options into config format
 * @param {Object} options - CLI options from Commander
 * @returns {Object} Parsed configuration
 */
export function parseCliOptions(options) {
  let config = {};

  if (options.viewports) {
    config.viewports = options.viewports
      .split(',')
      .map(v => parseViewport(v.trim()))
      .filter(Boolean);
  }

  if (options.concurrency !== undefined) {
    config.concurrency = options.concurrency;
  }

  if (options.include) {
    config.include = options.include;
  }

  if (options.exclude) {
    config.exclude = options.exclude;
  }

  if (options.headless !== undefined) {
    config.browser = { ...config.browser, headless: options.headless };
  }

  if (options.browserArgs) {
    let args = options.browserArgs.split(',').map(arg => arg.trim());
    config.browser = { ...config.browser, args };
  }

  if (options.fullPage !== undefined) {
    config.screenshot = { ...config.screenshot, fullPage: options.fullPage };
  }

  return config;
}

/**
 * Merge multiple config objects with priority
 * Later configs override earlier ones
 * @param {...Object} configs - Config objects to merge
 * @returns {Object} Merged configuration
 */
export function mergeConfigs(...configs) {
  return configs.reduce((merged, config) => {
    if (!config) return merged;

    return {
      ...merged,
      ...config,
      // Deep merge nested objects
      browser: {
        ...merged.browser,
        ...config.browser,
        args: config.browser?.args || merged.browser?.args || [],
      },
      screenshot: {
        ...merged.screenshot,
        ...config.screenshot,
      },
      interactions: {
        ...merged.interactions,
        ...config.interactions,
      },
      viewports: config.viewports || merged.viewports,
    };
  }, {});
}

/**
 * Merge story-level config with global config
 * Story config takes precedence
 * @param {Object} globalConfig - Global configuration
 * @param {Object} storyConfig - Story-specific configuration
 * @returns {Object} Merged configuration for story
 */
export function mergeStoryConfig(globalConfig, storyConfig) {
  if (!storyConfig) return globalConfig;

  return {
    ...globalConfig,
    ...storyConfig,
    viewports: storyConfig.viewports || globalConfig.viewports,
    screenshot: {
      ...globalConfig.screenshot,
      ...storyConfig.screenshot,
    },
    beforeScreenshot:
      storyConfig.beforeScreenshot || globalConfig.beforeScreenshot,
  };
}

/**
 * Load and merge all configuration sources
 * Priority: CLI options > vizzlyConfig.storybook > defaults
 * @param {string} storybookPath - Path to Storybook build
 * @param {Object} cliOptions - Options from CLI
 * @param {Object} vizzlyConfig - Main Vizzly configuration object
 * @returns {Promise<Object>} Final merged configuration
 */
export async function loadConfig(
  storybookPath,
  cliOptions = {},
  vizzlyConfig = {}
) {
  // Extract storybook config from main vizzly config
  let pluginConfig = vizzlyConfig?.storybook || {};

  let parsedCliOptions = parseCliOptions(cliOptions);

  let config = mergeConfigs(
    defaultConfig,
    pluginConfig,
    parsedCliOptions,
    { storybookPath } // Always set storybookPath from argument
  );

  return config;
}
