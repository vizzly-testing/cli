/**
 * Functional context pool for browser context management
 * Uses Playwright's BrowserContext for isolation between parallel workers
 */

/**
 * Default number of uses before recycling a context
 * After this many uses, the context is closed and a fresh one created
 * This prevents memory leaks from accumulating
 */
let DEFAULT_RECYCLE_AFTER = 10;

/**
 * Create a context pool that manages browser contexts with reuse and recycling
 * Uses Playwright's BrowserContext for proper isolation between parallel workers
 * @param {Object} browser - Playwright browser instance
 * @param {number} size - Maximum number of concurrent contexts
 * @param {Object} [options] - Pool options
 * @param {number} [options.recycleAfter=10] - Recycle context after N uses
 * @param {Object} [options.viewport] - Default viewport for new contexts
 * @returns {Object} Pool operations: { acquire, release, drain, stats }
 */
export function createTabPool(browser, size, options = {}) {
  let { recycleAfter = DEFAULT_RECYCLE_AFTER, viewport } = options;

  // Track contexts with their use counts and pages
  let available = [];
  let waiting = [];
  let totalContexts = 0;
  let recycledCount = 0;

  /**
   * Create a fresh context entry with a page
   * @returns {Promise<Object>} Context entry { context, page, useCount }
   */
  let createContextEntry = async () => {
    let contextOptions = {};
    if (viewport) {
      contextOptions.viewport = { width: viewport.width, height: viewport.height };
    }
    let context = await browser.newContext(contextOptions);
    let page = await context.newPage();
    return { context, page, useCount: 0 };
  };

  /**
   * Acquire a page from the pool
   * Returns an existing page if available, creates new if under limit,
   * or waits for one to become available.
   *
   * IMPORTANT: If drain() is called while waiting, this returns null.
   * Callers MUST check for null before using the page.
   *
   * @returns {Promise<Object|null>} Playwright page instance, or null if pool was drained
   */
  let acquire = async () => {
    // Reuse existing context/page if available
    if (available.length > 0) {
      let entry = available.pop();
      entry.useCount++;
      return entry.page;
    }

    // Create new context if under limit
    if (totalContexts < size) {
      totalContexts++;
      let entry = await createContextEntry();
      entry.useCount = 1;
      // Store entry reference on page for release lookup
      entry.page._poolEntry = entry;
      return entry.page;
    }

    // Wait for a context to become available
    return new Promise(resolve => {
      waiting.push(resolve);
    });
  };

  /**
   * Release a page back to the pool
   * Recycles (closes and replaces) contexts that have been used too many times.
   * If workers are waiting, hand off directly; otherwise add to available.
   * @param {Object} page - Playwright page instance to release
   */
  let release = async page => {
    if (!page) return;

    let entry = page._poolEntry;

    // Check if context needs recycling
    if (entry && entry.useCount >= recycleAfter) {
      recycledCount++;

      // Close the old context (this also closes all its pages)
      try {
        await entry.context.close();
      } catch {
        // Ignore close errors
      }

      // Create a fresh replacement
      try {
        let newEntry = await createContextEntry();
        newEntry.page._poolEntry = newEntry;

        // Hand off to waiting worker or add to available
        if (waiting.length > 0) {
          newEntry.useCount = 1;
          let next = waiting.shift();
          next(newEntry.page);
        } else {
          available.push(newEntry);
        }
      } catch {
        // Failed to create new context - reduce total count and notify waiting worker
        totalContexts--;
        if (waiting.length > 0) {
          let next = waiting.shift();
          next(null); // Signal failure so task can handle it
        }
      }
      return;
    }

    // If someone is waiting, give them the page directly
    if (waiting.length > 0) {
      if (entry) entry.useCount++;
      let next = waiting.shift();
      next(page);
    } else if (entry) {
      available.push(entry);
    } else {
      // Orphaned page - shouldn't happen but handle gracefully
      available.push({ page, useCount: 0 });
    }
  };

  /**
   * Close all contexts and reset pool state
   * Call this when done with the pool.
   *
   * Any pending acquire() calls will resolve with null.
   * Callers must handle null returns from acquire() after drain.
   *
   * @returns {Promise<void>}
   */
  let drain = async () => {
    // Close all available contexts
    await Promise.all(
      available.map(entry =>
        entry.context.close().catch(() => {
          // Ignore close errors (context may already be closed)
        })
      )
    );

    available = [];
    totalContexts = 0;

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
    total: totalContexts,
    size,
    recycled: recycledCount,
  });

  return { acquire, release, drain, stats };
}
