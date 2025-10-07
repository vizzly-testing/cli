/**
 * Interaction hook system
 * Functions for managing and applying hooks to stories
 */

import { findMatchingHook } from './utils/patterns.js';
import { extractStoryConfig } from './crawler.js';
import { mergeStoryConfig } from './config.js';

/**
 * Get the beforeScreenshot hook for a story
 * Priority: story-level config > global pattern match > null
 * @param {Object} story - Story object
 * @param {Object} globalConfig - Global configuration
 * @returns {Function|null} Hook function or null
 */
export function getBeforeScreenshotHook(story, globalConfig) {
  // Check story-level config first
  let storyConfig = extractStoryConfig(story);
  if (storyConfig?.beforeScreenshot) {
    return storyConfig.beforeScreenshot;
  }

  // Check global interactions pattern matching
  let globalHook = findMatchingHook(story, globalConfig.interactions);
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

/**
 * Get merged config for a story
 * Combines global config with story-specific config
 * @param {Object} story - Story object
 * @param {Object} globalConfig - Global configuration
 * @returns {Object} Merged configuration for this story
 */
export function getStoryConfig(story, globalConfig) {
  let storyConfig = extractStoryConfig(story);
  return mergeStoryConfig(globalConfig, storyConfig);
}
