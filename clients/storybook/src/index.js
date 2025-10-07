/**
 * Main entry point for @vizzly-testing/storybook
 * Functional orchestration of story discovery and screenshot capture
 */

import pMap from 'p-map';
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
 * @returns {Promise<void>}
 */
async function processStory(story, browser, config, context) {
  let { logger } = context;
  let storyConfig = getStoryConfig(story, config);
  let baseUrl = `file://${resolve(config.storybookPath)}`;
  let storyUrl = generateStoryUrl(baseUrl, story.id);
  let hook = getBeforeScreenshotHook(story, config);

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
      throw error;
    } finally {
      await closePage(page);
    }
  }
}

/**
 * Process all stories with concurrency control
 * @param {Array<Object>} stories - Array of story objects
 * @param {Object} browser - Browser instance
 * @param {Object} config - Configuration
 * @param {Object} context - Plugin context
 * @returns {Promise<void>}
 */
async function processStories(stories, browser, config, context) {
  await pMap(
    stories,
    async (story) => {
      await processStory(story, browser, config, context);
    },
    { concurrency: config.concurrency }
  );
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
    await processStories(stories, browser, config, context);

    logger?.info?.('✓ All stories processed successfully');
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
