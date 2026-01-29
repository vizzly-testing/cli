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
 * First visit per tab does a full page load, subsequent visits use Storybook's internal API
 *
 * @param {Object} tab - Puppeteer page instance
 * @param {string} storyId - Story ID to navigate to
 * @param {string} baseUrl - Base Storybook URL
 * @param {Object} [options] - Navigation options
 * @param {number} [options.timeout=30000] - Navigation timeout in ms
 * @returns {Promise<void>}
 */
export async function navigateToStory(tab, storyId, baseUrl, options = {}) {
  let { timeout = 30000 } = options;
  let entry = tab._poolEntry;

  // First time this tab visits Storybook: full page load
  if (!entry?.storybookInitialized) {
    await fullPageNavigation(tab, storyId, baseUrl, timeout);

    if (entry) {
      entry.storybookInitialized = true;
      entry.currentStoryId = storyId;
    }
    return;
  }

  // Same story (maybe different viewport) - no navigation needed
  if (entry.currentStoryId === storyId) {
    return;
  }

  // Subsequent visit: use client-side navigation
  try {
    await clientSideNavigation(tab, storyId, timeout);
    entry.currentStoryId = storyId;
  } catch (error) {
    // Log and fallback to full navigation if client-side fails
    console.debug?.(
      `Client-side navigation failed for ${storyId}, falling back to full page load:`,
      error.message
    );
    await fullPageNavigation(tab, storyId, baseUrl, timeout);
    entry.currentStoryId = storyId;
  }
}

/**
 * Perform full page navigation (initial load)
 * @param {Object} tab - Puppeteer page instance
 * @param {string} storyId - Story ID
 * @param {string} baseUrl - Base URL
 * @param {number} timeout - Timeout in ms
 */
async function fullPageNavigation(tab, storyId, baseUrl, timeout) {
  let url = generateStoryUrl(baseUrl, storyId);

  try {
    await tab.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });
  } catch (error) {
    // Fallback to domcontentloaded if networkidle2 times out
    if (
      error.message.includes('timeout') ||
      error.message.includes('Navigation timeout')
    ) {
      await tab.goto(url, {
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
 * @param {Object} tab - Puppeteer page instance
 * @param {string} storyId - Story ID
 * @param {number} timeout - Timeout in ms
 */
async function clientSideNavigation(tab, storyId, timeout) {
  // Navigate using Storybook's preview API and wait for story to render
  await tab.evaluate(
    (id, timeoutMs) => {
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
    storyId,
    timeout
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
