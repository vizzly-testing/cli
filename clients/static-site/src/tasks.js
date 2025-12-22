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
 * Format milliseconds as human-readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted duration (e.g., "2m 30s", "45s")
 */
function formatDuration(ms) {
  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Check if stdout is an interactive TTY
 * @returns {boolean}
 */
function isInteractiveTTY() {
  return process.stdout.isTTY && !process.env.CI;
}

/**
 * Clear current line and write new content (for TTY)
 * @param {string} text - Text to write
 */
function writeProgress(text) {
  if (isInteractiveTTY()) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(text);
  }
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
  let startTime = Date.now();
  let taskTimes = [];
  let interactive = isInteractiveTTY();

  // Merge deps for processTask
  let taskDeps = { ...defaultDeps, ...deps };

  await mapWithConcurrency(
    tasks,
    async task => {
      let taskStart = Date.now();
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

        // Track task duration for ETA calculation
        let taskDuration = Date.now() - taskStart;
        taskTimes.push(taskDuration);

        // Calculate ETA based on average task time
        let avgTime = taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length;
        let remaining = total - completed;
        // Divide by concurrency since tasks run in parallel
        let etaMs = (remaining * avgTime) / config.concurrency;
        let eta = remaining > 0 ? `~${formatDuration(etaMs)} remaining` : '';
        let percent = Math.round((completed / total) * 100);

        if (interactive) {
          // Update single progress line
          writeProgress(
            `   📸 [${completed}/${total}] ${percent}% ${eta} - ${task.page.path}@${task.viewport.name}`
          );
        } else {
          // Non-interactive: log each completion
          logger.info(
            `   ✓ [${completed}/${total}] ${task.page.path}@${task.viewport.name} ${eta}`
          );
        }
      } catch (error) {
        completed++;
        errors.push({
          page: task.page.path,
          viewport: task.viewport.name,
          error: error.message,
        });

        if (interactive) {
          // Clear progress line and log error
          writeProgress('');
          process.stdout.write('\n');
        }
        logger.error(
          `   ✗ ${task.page.path}@${task.viewport.name}: ${error.message}`
        );
      } finally {
        pool.release(tab);
      }
    },
    config.concurrency
  );

  // Clear progress line and show completion
  if (interactive) {
    writeProgress('');
    process.stdout.write('\n');
  }

  // Log total time
  let totalTime = Date.now() - startTime;
  logger.info(
    `   ✅ Completed ${total} screenshots in ${formatDuration(totalTime)}`
  );

  if (errors.length > 0) {
    logger.warn(`   ⚠️  ${errors.length} failed`);
  }

  return errors;
}
