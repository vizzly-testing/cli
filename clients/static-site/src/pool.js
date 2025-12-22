/**
 * Functional tab pool for browser tab management
 * Uses closures instead of classes for a more functional approach
 */

/**
 * Create a tab pool that manages browser tabs with reuse
 * @param {Object} browser - Puppeteer browser instance
 * @param {number} size - Maximum number of concurrent tabs
 * @returns {Object} Pool operations: { acquire, release, drain, stats }
 */
export function createTabPool(browser, size) {
  let available = [];
  let waiting = [];
  let totalTabs = 0;

  /**
   * Acquire a tab from the pool
   * Returns an existing tab if available, creates new if under limit,
   * or waits for one to become available.
   *
   * IMPORTANT: If drain() is called while waiting, this returns null.
   * Callers MUST check for null before using the tab.
   *
   * @returns {Promise<Object|null>} Puppeteer page instance, or null if pool was drained
   */
  let acquire = async () => {
    // Reuse existing tab if available
    if (available.length > 0) {
      return available.pop();
    }

    // Create new tab if under limit
    if (totalTabs < size) {
      totalTabs++;
      return await browser.newPage();
    }

    // Wait for a tab to become available
    return new Promise(resolve => {
      waiting.push(resolve);
    });
  };

  /**
   * Reset tab state to prevent cross-contamination between tasks
   * Clears cookies, localStorage, and resets to about:blank
   * @param {Object} tab - Puppeteer page instance
   * @returns {Promise<void>}
   */
  let resetTab = async tab => {
    try {
      // Clear cookies for this page's context
      let client = await tab.createCDPSession();
      await client.send('Network.clearBrowserCookies');
      await client.detach();

      // Clear localStorage/sessionStorage by navigating to blank page
      await tab.goto('about:blank', { waitUntil: 'domcontentloaded' });
    } catch {
      // Ignore reset errors - tab may be in a bad state but still usable
    }
  };

  /**
   * Release a tab back to the pool
   * Resets tab state before reuse to prevent cross-contamination.
   * If workers are waiting, hand off directly; otherwise add to available.
   * @param {Object} tab - Puppeteer page instance to release
   */
  let release = async tab => {
    if (!tab) return;

    // Reset tab state before reuse
    await resetTab(tab);

    // If someone is waiting, give them the tab directly
    if (waiting.length > 0) {
      let next = waiting.shift();
      next(tab);
    } else {
      available.push(tab);
    }
  };

  /**
   * Close all tabs and reset pool state
   * Call this when done with the pool.
   *
   * Any pending acquire() calls will resolve with null.
   * Callers must handle null returns from acquire() after drain.
   *
   * @returns {Promise<void>}
   */
  let drain = async () => {
    // Close all available tabs
    await Promise.all(
      available.map(tab =>
        tab.close().catch(() => {
          // Ignore close errors (tab may already be closed)
        })
      )
    );

    available = [];
    totalTabs = 0;

    // Resolve any waiting acquires with null
    for (let resolve of waiting) {
      resolve(null);
    }
    waiting = [];
  };

  /**
   * Get current pool statistics
   * @returns {Object} { available, waiting, total, size }
   */
  let stats = () => ({
    available: available.length,
    waiting: waiting.length,
    total: totalTabs,
    size,
  });

  return { acquire, release, drain, stats };
}
