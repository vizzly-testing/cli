/**
 * Functional tab pool for browser tab management
 * Uses closures instead of classes for a more functional approach
 */

/**
 * Default number of uses before recycling a tab
 * After this many uses, the tab is closed and a fresh one created
 * This prevents memory leaks from accumulating
 */
let DEFAULT_RECYCLE_AFTER = 10;

/**
 * Create a tab pool that manages browser tabs with reuse and recycling
 * @param {Object} browser - Puppeteer browser instance
 * @param {number} size - Maximum number of concurrent tabs
 * @param {Object} [options] - Pool options
 * @param {number} [options.recycleAfter=10] - Recycle tab after N uses
 * @returns {Object} Pool operations: { acquire, release, drain, stats }
 */
export function createTabPool(browser, size, options = {}) {
  let { recycleAfter = DEFAULT_RECYCLE_AFTER } = options;

  // Track tabs with their use counts: { tab, useCount }
  let available = [];
  let waiting = [];
  let totalTabs = 0;
  let recycledCount = 0;

  /**
   * Create a fresh tab entry
   * @returns {Promise<Object>} Tab entry { tab, useCount }
   */
  let createTabEntry = async () => {
    let tab = await browser.newPage();
    return { tab, useCount: 0 };
  };

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
      let entry = available.pop();
      entry.useCount++;
      return entry.tab;
    }

    // Create new tab if under limit
    if (totalTabs < size) {
      totalTabs++;
      let entry = await createTabEntry();
      entry.useCount = 1;
      // Store entry reference on tab for release lookup
      entry.tab._poolEntry = entry;
      return entry.tab;
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
   * Recycles (closes and replaces) tabs that have been used too many times.
   * If workers are waiting, hand off directly; otherwise add to available.
   * @param {Object} tab - Puppeteer page instance to release
   */
  let release = async tab => {
    if (!tab) return;

    let entry = tab._poolEntry;

    // Check if tab needs recycling
    if (entry && entry.useCount >= recycleAfter) {
      recycledCount++;

      // Close the old tab
      try {
        await tab.close();
      } catch {
        // Ignore close errors
      }

      // Create a fresh replacement
      try {
        let newEntry = await createTabEntry();
        newEntry.tab._poolEntry = newEntry;

        // Hand off to waiting worker or add to available
        if (waiting.length > 0) {
          newEntry.useCount = 1;
          let next = waiting.shift();
          next(newEntry.tab);
        } else {
          available.push(newEntry);
        }
      } catch {
        // Failed to create new tab - reduce total count and notify waiting worker
        totalTabs--;
        if (waiting.length > 0) {
          let next = waiting.shift();
          next(null); // Signal failure so task can handle it
        }
      }
      return;
    }

    // Reset tab state before reuse
    await resetTab(tab);

    // If someone is waiting, give them the tab directly
    if (waiting.length > 0) {
      if (entry) entry.useCount++;
      let next = waiting.shift();
      next(tab);
    } else if (entry) {
      available.push(entry);
    } else {
      available.push({ tab, useCount: 0 });
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
      available.map(entry =>
        entry.tab.close().catch(() => {
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
   * @returns {Object} { available, waiting, total, size, recycled }
   */
  let stats = () => ({
    available: available.length,
    waiting: waiting.length,
    total: totalTabs,
    size,
    recycled: recycledCount,
  });

  return { acquire, release, drain, stats };
}
