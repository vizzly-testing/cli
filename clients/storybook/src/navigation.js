/**
 * Smart navigation for Storybook
 * Uses client-side navigation when possible to avoid full page reloads
 * This dramatically improves performance by not reloading the Storybook bundle for each story
 */

/**
 * Generate iframe URL for a story
 * @param {string} baseUrl - Base Storybook URL
 * @param {string} storyId - Story ID
 * @returns {string} Full iframe URL
 */
export function generateStoryUrl(baseUrl, storyId) {
  return `${baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}

/**
 * Navigate to a story using client-side navigation when possible
 * First visit per page does a full page load, subsequent visits use Storybook's internal API
 *
 * @param {Object} page - Playwright page instance
 * @param {string} storyId - Story ID to navigate to
 * @param {string} baseUrl - Base Storybook URL
 * @param {Object} [options] - Navigation options
 * @param {number} [options.timeout=30000] - Navigation timeout in ms
 * @returns {Promise<void>}
 */
export async function navigateToStory(page, storyId, baseUrl, options = {}) {
  let { timeout = 30000 } = options;
  let entry = page._poolEntry;
  let verbose = process.env.VIZZLY_LOG_LEVEL === 'debug';

  // Debug: log navigation mode
  let navMode = !entry?.storybookInitialized
    ? 'full-page-init'
    : entry.currentStoryId === storyId
      ? 'skip-same-story'
      : 'client-side';

  if (verbose) {
    console.error(`  [nav] ${storyId}: ${navMode} (poolEntry: ${!!entry})`);
  }

  // First time this tab visits Storybook: full page load
  if (!entry?.storybookInitialized) {
    let start = Date.now();
    await fullPageNavigation(page, storyId, baseUrl, timeout);

    if (verbose) {
      console.error(`  [nav] ${storyId}: full-page took ${Date.now() - start}ms`);
    }

    if (entry) {
      entry.storybookInitialized = true;
      entry.currentStoryId = storyId;
    }
    return;
  }

  // Same story (maybe different viewport) - no navigation needed
  if (entry.currentStoryId === storyId) {
    if (verbose) {
      console.error(`  [nav] ${storyId}: skip (same story)`);
    }
    return;
  }

  // Subsequent visit: use client-side navigation
  try {
    let start = Date.now();
    await clientSideNavigation(page, storyId, timeout);

    if (verbose) {
      console.error(`  [nav] ${storyId}: client-side took ${Date.now() - start}ms`);
    }
    entry.currentStoryId = storyId;
  } catch (error) {
    // Log fallback - always show since this is unexpected behavior
    console.error(
      `  [nav] ${storyId}: client-side failed, falling back to full-page: ${error.message}`
    );
    let start = Date.now();
    await fullPageNavigation(page, storyId, baseUrl, timeout);

    if (verbose) {
      console.error(`  [nav] ${storyId}: fallback full-page took ${Date.now() - start}ms`);
    }
    entry.currentStoryId = storyId;
  }
}

/**
 * Perform full page navigation (initial load)
 * @param {Object} page - Playwright page instance
 * @param {string} storyId - Story ID
 * @param {string} baseUrl - Base URL
 * @param {number} timeout - Timeout in ms
 */
async function fullPageNavigation(page, storyId, baseUrl, timeout) {
  let url = generateStoryUrl(baseUrl, storyId);

  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout,
    });
  } catch (error) {
    // Fallback to domcontentloaded if networkidle times out
    if (
      error.message.includes('timeout') ||
      error.message.includes('Timeout')
    ) {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
    } else {
      throw error;
    }
  }
}

/**
 * Perform client-side navigation using Storybook's internal API
 * This is much faster as it doesn't reload the entire bundle
 * @param {Object} page - Playwright page instance
 * @param {string} storyId - Story ID
 * @param {number} timeout - Timeout in ms
 */
async function clientSideNavigation(page, storyId, timeout) {
  // Navigate using Storybook's preview API and wait for story to render
  // Playwright requires passing arguments as an object in the second parameter
  await page.evaluate(
    ({ id, timeoutMs }) => {
      return new Promise((resolve, reject) => {
        let preview = window.__STORYBOOK_PREVIEW__;
        if (!preview?.channel) {
          reject(new Error('Storybook preview API not available'));
          return;
        }

        let timeoutId;

        // Listen for story render completion
        let handleRendered = () => {
          clearTimeout(timeoutId);
          preview.channel.off('storyRendered', handleRendered);
          resolve();
        };
        preview.channel.on('storyRendered', handleRendered);

        // Navigate to the story
        preview.channel.emit('setCurrentStory', { storyId: id });

        // Timeout fallback - use configured timeout
        timeoutId = setTimeout(() => {
          preview.channel.off('storyRendered', handleRendered);
          resolve(); // Resolve anyway - story might have rendered
        }, timeoutMs);
      });
    },
    { id: storyId, timeoutMs: timeout }
  );
}

/**
 * Reset tab's Storybook state (called on tab recycle)
 * @param {Object} entry - Pool entry for the tab
 */
export function resetStorybookState(entry) {
  if (entry) {
    entry.storybookInitialized = false;
    entry.currentStoryId = null;
  }
}
