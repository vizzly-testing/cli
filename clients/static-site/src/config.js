/**
 * Configuration loading and merging for Static Site plugin
 * Pure functions for managing configuration
 * Reads from config.staticSite section of main vizzly.config.js
 */

import { validateStaticSiteConfigWithDefaults } from './config-schema.js';
import { loadInteractions } from './utils/interactions-loader.js';
import { parseViewport } from './utils/viewport.js';

/**
 * Default configuration values
 */
export let defaultConfig = {
  buildPath: null,
  viewports: [{ name: 'default', width: 1920, height: 1080 }],
  browser: {
    headless: true,
    args: [],
  },
  screenshot: {
    fullPage: false,
    omitBackground: false,
  },
  concurrency: 3,
  include: null,
  exclude: null,
  pageDiscovery: {
    useSitemap: true,
    sitemapPath: 'sitemap.xml',
    scanHtml: true,
  },
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

  if (options.timeout !== undefined) {
    config.screenshot = { ...config.screenshot, timeout: options.timeout };
  }

  if (options.useSitemap !== undefined) {
    config.pageDiscovery = {
      ...config.pageDiscovery,
      useSitemap: options.useSitemap,
    };
  }

  if (options.sitemapPath) {
    config.pageDiscovery = {
      ...config.pageDiscovery,
      sitemapPath: options.sitemapPath,
    };
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
      pageDiscovery: {
        ...merged.pageDiscovery,
        ...config.pageDiscovery,
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
 * Get configuration for a specific page
 * Checks if there are page-specific overrides in config.pages
 * @param {Object} globalConfig - Global configuration
 * @param {Object} page - Page object with path
 * @returns {Object} Configuration for page
 */
export function getPageConfig(globalConfig, page) {
  // If no page-specific configs defined, return global
  if (!globalConfig.pages || Object.keys(globalConfig.pages).length === 0) {
    return globalConfig;
  }

  // Find matching page config by pattern
  let pageOverrides = null;
  for (let [pattern, config] of Object.entries(globalConfig.pages)) {
    // Simple pattern matching - exact match or wildcard
    if (pattern === page.path || matchPattern(pattern, page.path)) {
      pageOverrides = config;
      break;
    }
  }

  if (!pageOverrides) {
    return globalConfig;
  }

  // Merge page overrides with global config
  let merged = {
    ...globalConfig,
    ...pageOverrides,
    screenshot: {
      ...globalConfig.screenshot,
      ...pageOverrides.screenshot,
    },
  };

  // Handle viewport names - resolve to actual viewport objects
  if (pageOverrides.viewports && Array.isArray(pageOverrides.viewports)) {
    if (typeof pageOverrides.viewports[0] === 'string') {
      // Viewport names - filter from global viewports
      merged.viewports = globalConfig.viewports.filter(vp =>
        pageOverrides.viewports.includes(vp.name)
      );
    } else {
      // Viewport objects - use as-is
      merged.viewports = pageOverrides.viewports;
    }
  }

  return merged;
}

/**
 * Simple glob pattern matching for page paths
 * @param {string} pattern - Pattern like "blog/*" or "/about"
 * @param {string} path - Page path to test
 * @returns {boolean} True if path matches pattern
 */
function matchPattern(pattern, path) {
  // Convert glob pattern to regex
  let regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');

  let regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

/**
 * Load and merge all configuration sources
 * Priority: CLI options > vizzly.static-site.js > vizzlyConfig.staticSite > defaults
 * @param {string} buildPath - Path to static site build
 * @param {Object} cliOptions - Options from CLI
 * @param {Object} vizzlyConfig - Main Vizzly configuration object
 * @returns {Promise<Object>} Final merged configuration
 * @throws {Error} If configuration validation fails
 */
export async function loadConfig(
  buildPath,
  cliOptions = {},
  vizzlyConfig = {}
) {
  // Extract and validate staticSite config from main vizzly config
  let pluginConfig = vizzlyConfig?.staticSite || {};

  // Validate plugin config using Zod schema
  let validatedPluginConfig =
    validateStaticSiteConfigWithDefaults(pluginConfig);

  // Load interactions from separate file if it exists
  let interactionsConfig = await loadInteractions();

  let parsedCliOptions = parseCliOptions(cliOptions);

  let config = mergeConfigs(
    defaultConfig,
    validatedPluginConfig,
    interactionsConfig, // Merge interactions file
    parsedCliOptions,
    { buildPath } // Always set buildPath from argument
  );

  return config;
}
