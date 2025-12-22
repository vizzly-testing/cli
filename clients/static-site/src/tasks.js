/**
 * Task generation and processing for static site screenshots
 * Functional approach: tasks are (page, viewport) tuples processed through a tab pool
 */

import { getPageConfig as defaultGetPageConfig } from './config.js';
import { generatePageUrl as defaultGeneratePageUrl } from './crawler.js';
import { getBeforeScreenshotHook as defaultGetBeforeScreenshotHook } from './hooks.js';
import { captureAndSendScreenshot as defaultCaptureAndSendScreenshot } from './screenshot.js';
import { setViewport as defaultSetViewport } from './utils/viewport.js';
import { navigateToUrl as defaultNavigateToUrl } from './browser.js';

/**
 * Default dependencies for task operations
 */
let defaultDeps = {
  getPageConfig: defaultGetPageConfig,
  generatePageUrl: defaultGeneratePageUrl,
  getBeforeScreenshotHook: defaultGetBeforeScreenshotHook,
  captureAndSendScreenshot: defaultCaptureAndSendScreenshot,
  setViewport: defaultSetViewport,
  navigateToUrl: defaultNavigateToUrl,
};

/**
 * Generate all tasks from pages and config
 * Flattens pages × viewports into individual work items
 * @param {Array<Object>} pages - Array of page objects
 * @param {string} baseUrl - Base URL for the static server
 * @param {Object} config - Configuration object
 * @param {Object} [deps] - Optional dependencies for testing
 * @returns {Array<Object>} Array of task objects
 */
export function generateTasks(pages, baseUrl, config, deps = {}) {
  let { getPageConfig, generatePageUrl, getBeforeScreenshotHook } = {
    ...defaultDeps,
    ...deps,
  };

  return pages.flatMap(page => {
    let pageConfig = getPageConfig(config, page);
    let url = generatePageUrl(baseUrl, page);
    let hook = getBeforeScreenshotHook(page, config);

    return pageConfig.viewports.map(viewport => ({
      page,
      viewport,
      hook,
      url,
      screenshotOptions: pageConfig.screenshot || {},
    }));
  });
}

/**
 * Process a single task with a tab
 * @param {Object} tab - Puppeteer page instance
 * @param {Object} task - Task object { page, viewport, hook, url, screenshotOptions }
 * @param {Object} [deps] - Optional dependencies for testing
 * @returns {Promise<void>}
 */
export async function processTask(tab, task, deps = {}) {
  let { setViewport, navigateToUrl, captureAndSendScreenshot } = {
    ...defaultDeps,
    ...deps,
  };

  let { page, viewport, hook, url, screenshotOptions } = task;

  // Set viewport (tab is reused, so always set)
  await setViewport(tab, viewport);

  // Navigate to the page
  await navigateToUrl(tab, url);

  // Run interaction hook if provided
  if (hook && typeof hook === 'function') {
    await hook(tab);
  }

  // Capture and send screenshot
  await captureAndSendScreenshot(tab, page, viewport, screenshotOptions);
}

/**
 * Process items with limited parallelism using a Set-based approach
 * Uses Set.delete() for O(1) cleanup vs Array.splice() O(n)
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to process each item
 * @param {number} concurrency - Max parallel operations
 * @returns {Promise<void>}
 */
export async function mapWithConcurrency(items, fn, concurrency) {
  let executing = new Set();
  let results = [];

  for (let item of items) {
    let promise = fn(item).finally(() => {
      executing.delete(promise);
    });

    executing.add(promise);
    results.push(promise);

    if (executing.size >= concurrency) {
      // Wait for one to complete (but don't reject yet - let Promise.all handle it)
      await Promise.race(executing).catch(() => {});
    }
  }

  // This will reject if any promise rejected
  await Promise.all(results);
}

/**
 * Process all tasks through the tab pool
 * @param {Array<Object>} tasks - Array of task objects
 * @param {Object} pool - Tab pool { acquire, release }
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @param {Object} [deps] - Optional dependencies for testing
 * @returns {Promise<Array>} Array of errors encountered
 */
export async function processAllTasks(tasks, pool, config, logger, deps = {}) {
  let errors = [];
  let completed = 0;
  let total = tasks.length;

  // Merge deps for processTask
  let taskDeps = { ...defaultDeps, ...deps };

  await mapWithConcurrency(
    tasks,
    async task => {
      let tab = await pool.acquire();

      // Handle case where pool was drained while waiting
      if (!tab) {
        errors.push({
          page: task.page.path,
          viewport: task.viewport.name,
          error: 'Pool was drained before task could be processed',
        });
        return;
      }

      try {
        await processTask(tab, task, taskDeps);
        completed++;
        logger.info(
          `   ✓ [${completed}/${total}] ${task.page.path}@${task.viewport.name}`
        );
      } catch (error) {
        completed++;
        errors.push({
          page: task.page.path,
          viewport: task.viewport.name,
          error: error.message,
        });
        logger.error(
          `   ✗ [${completed}/${total}] ${task.page.path}@${task.viewport.name}: ${error.message}`
        );
      } finally {
        pool.release(tab);
      }
    },
    config.concurrency
  );

  return errors;
}
