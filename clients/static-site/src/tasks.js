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
 * Create a simple output coordinator for TTY progress
 * Prevents race conditions when multiple concurrent tasks update progress
 * @returns {Object} Coordinator with writeProgress and logError methods
 */
function createOutputCoordinator() {
  let pendingErrors = [];
  let isWriting = false;

  return {
    /**
     * Update progress line (only in TTY mode)
     * @param {string} text - Progress text
     */
    writeProgress(text) {
      if (!isInteractiveTTY()) return;

      // Flush any pending errors first
      if (pendingErrors.length > 0 && !isWriting) {
        isWriting = true;
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        for (let err of pendingErrors) {
          process.stdout.write(`${err}\n`);
        }
        pendingErrors = [];
        isWriting = false;
      }

      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(text);
    },

    /**
     * Queue an error message to be printed
     * @param {string} message - Error message
     * @param {Object} logger - Logger instance
     */
    logError(message, logger) {
      if (isInteractiveTTY()) {
        // Queue error to be printed before next progress update
        pendingErrors.push(message);
      }
      logger.error(message);
    },

    /**
     * Clear progress and flush any remaining errors
     */
    flush() {
      if (!isInteractiveTTY()) return;

      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      for (let err of pendingErrors) {
        process.stdout.write(`${err}\n`);
      }
      pendingErrors = [];
    },
  };
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
  let output = createOutputCoordinator();

  // Minimum samples before showing ETA (avoids wild estimates from cold start)
  let minSamplesForEta = Math.min(5, Math.ceil(total * 0.1));

  // Merge deps for processTask
  let taskDeps = { ...defaultDeps, ...deps };

  /**
   * Attempt a task with optional retry on failure
   * On timeout/crash, closes the tab and retries with a fresh one
   */
  let attemptTask = async (task, tab, isRetry = false) => {
    try {
      await processTask(tab, task, taskDeps);
      return { success: true, tab };
    } catch (error) {
      let isTimeout =
        error.message.includes('timeout') ||
        error.message.includes('Timeout') ||
        error.message.includes('Target closed') ||
        error.message.includes('Protocol error');

      // If timeout on first attempt, close bad tab and retry with fresh one
      if (isTimeout && !isRetry) {
        try {
          await tab.close();
        } catch {
          // Ignore close errors
        }

        // Get a fresh tab for retry
        let freshTab = await pool.acquire();
        if (!freshTab) {
          return { success: false, error, tab: null };
        }

        return attemptTask(task, freshTab, true);
      }

      return { success: false, error, tab, isRetry };
    }
  };

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

      let result = await attemptTask(task, tab);

      if (result.success) {
        completed++;

        // Track task duration for ETA calculation (only successful tasks)
        let taskDuration = Date.now() - taskStart;
        taskTimes.push(taskDuration);

        // Calculate ETA - only show after enough samples for accuracy
        let eta = '';
        if (taskTimes.length >= minSamplesForEta) {
          // Use recent samples for better accuracy (exponential-ish weighting)
          let recentTimes = taskTimes.slice(-20);
          let avgTime =
            recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
          let remaining = total - completed;
          // Divide by concurrency since tasks run in parallel
          let etaMs = (remaining * avgTime) / config.concurrency;
          eta = remaining > 0 ? `~${formatDuration(etaMs)} remaining` : '';
        }
        let percent = Math.round((completed / total) * 100);

        if (interactive) {
          // Update single progress line
          output.writeProgress(
            `   📸 [${completed}/${total}] ${percent}% ${eta} - ${task.page.path}@${task.viewport.name}`
          );
        } else {
          // Non-interactive: log each completion
          logger.info(
            `   ✓ [${completed}/${total}] ${task.page.path}@${task.viewport.name} ${eta}`
          );
        }

        if (result.tab) {
          pool.release(result.tab);
        }
      } else {
        completed++;
        let retryNote = result.isRetry ? ' (after retry)' : '';
        errors.push({
          page: task.page.path,
          viewport: task.viewport.name,
          error: result.error.message + retryNote,
        });

        output.logError(
          `   ✗ ${task.page.path}@${task.viewport.name}: ${result.error.message}${retryNote}`,
          logger
        );

        if (result.tab) {
          pool.release(result.tab);
        }
      }
    },
    config.concurrency
  );

  // Flush any remaining output
  output.flush();

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
