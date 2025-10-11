/**
 * Interaction hook system
 * Functions for managing and applying hooks to pages
 */

import { findMatchingHook } from './utils/patterns.js';
import { getPageConfig as getPageConfigFromConfig } from './config.js';

/**
 * Get the beforeScreenshot hook for a page
 * Priority: page-level interaction config > global pattern match > null
 * @param {Object} page - Page object
 * @param {Object} globalConfig - Global configuration
 * @returns {Function|null} Hook function or null
 */
export function getBeforeScreenshotHook(page, globalConfig) {
  // Get page-specific config
  let pageConfig = getPageConfigFromConfig(globalConfig, page);

  // Check if page config specifies a named interaction
  if (pageConfig.interaction && pageConfig.interaction !== globalConfig.interaction) {
    let interactionName = pageConfig.interaction;
    if (globalConfig.interactions[interactionName]) {
      return globalConfig.interactions[interactionName];
    }
  }

  // Check global interactions pattern matching
  let globalHook = findMatchingHook(page, globalConfig.interactions);
  if (globalHook) {
    return globalHook;
  }

  return null;
}

/**
 * Apply hook to a page if it exists
 * @param {Object} page - Puppeteer page instance
 * @param {Function|null} hook - Hook function to apply
 * @param {Object} context - Additional context to pass to hook
 * @returns {Promise<void>}
 */
export async function applyHook(page, hook, context = {}) {
  if (!hook || typeof hook !== 'function') {
    return;
  }

  try {
    await hook(page, context);
  } catch (error) {
    throw new Error(`Hook execution failed: ${error.message}`);
  }
}
