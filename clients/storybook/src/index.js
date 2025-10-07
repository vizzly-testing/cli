/**
 * Main entry point for @vizzly-testing/storybook
 * Functional orchestration of story discovery and screenshot capture
 */

import { resolve } from 'path';
import { loadConfig } from './config.js';
import { discoverStories, generateStoryUrl } from './crawler.js';
import { launchBrowser, closeBrowser, prepareStoryPage, closePage } from './browser.js';
import { captureAndSendScreenshot } from './screenshot.js';
import { getBeforeScreenshotHook, getStoryConfig } from './hooks.js';

/**
 * Process a single story across all configured viewports
 * @param {Object} story - Story object
 * @param {Object} browser - Browser instance
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<Object>} Result object with success count and errors
 */
async function processStory(story, browser, config, context) {
  let { logger } = context;
  let storyConfig = getStoryConfig(story, config);
  let baseUrl = `file://${resolve(config.storybookPath)}`;
  let storyUrl = generateStoryUrl(baseUrl, story.id);
  let hook = getBeforeScreenshotHook(story, config);
  let errors = [];

  logger?.info?.(`Processing story: ${story.title}/${story.name}`);

  // Process each viewport for this story
  for (let viewport of storyConfig.viewports) {
    let page = null;

    try {
      page = await prepareStoryPage(browser, storyUrl, viewport, hook);
      await captureAndSendScreenshot(
        page,
        story,
        viewport,
        storyConfig.screenshot
      );

      logger?.info?.(
        `  ✓ Captured ${story.title}/${story.name}@${viewport.name}`
      );
    } catch (error) {
      logger?.error?.(
        `  ✗ Failed to capture ${story.title}/${story.name}@${viewport.name}: ${error.message}`
      );
      errors.push({
        story: `${story.title}/${story.name}`,
        viewport: viewport.name,
        error: error.message,
      });
    } finally {
      await closePage(page);
    }
  }

  return { errors };
}

/**
 * Simple concurrency control - process items with limited parallelism
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to process each item
 * @param {number} concurrency - Max parallel operations
 * @returns {Promise<void>}
 */
async function mapWithConcurrency(items, fn, concurrency) {
  let results = [];
  let executing = [];

  for (let item of items) {
    let promise = fn(item).then((result) => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
}

/**
 * Process all stories with concurrency control
 * @param {Array<Object>} stories - Array of story objects
 * @param {Object} browser - Browser instance
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<Array>} Array of all errors encountered
 */
async function processStories(stories, browser, config, context) {
  let allErrors = [];

  await mapWithConcurrency(
    stories,
    async (story) => {
      let { errors } = await processStory(story, browser, config, context);
      allErrors.push(...errors);
    },
    config.concurrency
  );

  return allErrors;
}

/**
 * Main run function - orchestrates the entire screenshot capture process
 * @param {string} storybookPath - Path to static Storybook build
 * @param {Object} options - CLI options
 * @param {Object} context - Plugin context (logger, config, services)
 * @returns {Promise<void>}
 */
export async function run(storybookPath, options = {}, context = {}) {
  let { logger } = context;
  let browser = null;

  try {
    // Load and merge configuration
    let config = await loadConfig(storybookPath, options);

    logger?.info?.('Starting Storybook screenshot capture...');
    logger?.info?.(`Storybook path: ${config.storybookPath}`);

    // Discover stories
    logger?.info?.('Discovering stories...');
    let stories = await discoverStories(config.storybookPath, config);
    logger?.info?.(`Found ${stories.length} stories`);

    if (stories.length === 0) {
      logger?.warn?.('No stories found. Exiting.');
      return;
    }

    // Launch browser
    logger?.info?.('Launching browser...');
    browser = await launchBrowser(config.browser);

    // Process all stories
    logger?.info?.('Processing stories...');
    let errors = await processStories(stories, browser, config, context);

    // Report summary
    if (errors.length > 0) {
      logger?.warn?.(`\n⚠️  ${errors.length} screenshot(s) failed`);
      logger?.error?.('Failed screenshots:');
      errors.forEach(({ story, viewport, error }) => {
        logger?.error?.(`  - ${story}@${viewport}: ${error}`);
      });
    } else {
      logger?.info?.('✓ All stories processed successfully');
    }
  } catch (error) {
    logger?.error?.('Failed to process stories:', error.message);
    throw error;
  } finally {
    // Cleanup
    if (browser) {
      await closeBrowser(browser);
    }
  }
}

/**
 * Programmatic API export
 * Allows users to run Storybook screenshot capture programmatically
 */
export { run as default };
