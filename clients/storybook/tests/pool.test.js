/**
 * Tests for the functional tab pool
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { createTabPool } from '../src/pool.js';

/**
 * Create a mock page for testing
 */
function createMockPage(id) {
  return {
    id,
    goto: mock.fn(async () => {}),
  };
}

/**
 * Create a mock context for testing (Playwright BrowserContext)
 */
function createMockContext(id) {
  let page = createMockPage(id);
  return {
    id,
    page,
    newPage: mock.fn(async () => page),
    close: mock.fn(async () => {}),
  };
}

/**
 * Create a mock browser for testing (Playwright style)
 */
function createMockBrowser() {
  let contextCount = 0;
  let newContextCalls = 0;

  return {
    newContext: mock.fn(async () => {
      contextCount++;
      newContextCalls++;
      return createMockContext(contextCount);
    }),
    getPageCount: () => contextCount,
    getNewPageCalls: () => newContextCalls,
  };
}

describe('createTabPool', () => {
  it('creates a pool with acquire, release, drain, and stats', () => {
    let browser = createMockBrowser();
    let pool = createTabPool(browser, 3);

    assert.ok(pool.acquire);
    assert.ok(pool.release);
    assert.ok(pool.drain);
    assert.ok(pool.stats);
    assert.strictEqual(typeof pool.acquire, 'function');
    assert.strictEqual(typeof pool.release, 'function');
    assert.strictEqual(typeof pool.drain, 'function');
    assert.strictEqual(typeof pool.stats, 'function');
  });

  it('reports correct initial stats', () => {
    let browser = createMockBrowser();
    let pool = createTabPool(browser, 5);
    let stats = pool.stats();

    assert.strictEqual(stats.available, 0);
    assert.strictEqual(stats.waiting, 0);
    assert.strictEqual(stats.total, 0);
    assert.strictEqual(stats.size, 5);
  });

  describe('acquire', () => {
    it('creates a new tab when pool is empty', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      let tab = await pool.acquire();

      assert.strictEqual(browser.getNewPageCalls(), 1);
      assert.strictEqual(tab.id, 1);
      assert.strictEqual(pool.stats().total, 1);
    });

    it('creates tabs up to pool size', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      let tab1 = await pool.acquire();
      let tab2 = await pool.acquire();
      let tab3 = await pool.acquire();

      assert.strictEqual(browser.getNewPageCalls(), 3);
      assert.strictEqual(tab1.id, 1);
      assert.strictEqual(tab2.id, 2);
      assert.strictEqual(tab3.id, 3);
      assert.strictEqual(pool.stats().total, 3);
    });

    it('reuses released tabs instead of creating new ones', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      let tab1 = await pool.acquire();
      await pool.release(tab1);

      let tab2 = await pool.acquire();

      assert.strictEqual(browser.getNewPageCalls(), 1);
      assert.strictEqual(tab2, tab1);
    });

    it('waits when pool is exhausted', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 2);

      // Acquire all tabs
      let tab1 = await pool.acquire();
      await pool.acquire();

      // This should wait
      let acquirePromise = pool.acquire();

      // Stats should show waiting
      assert.strictEqual(pool.stats().waiting, 1);

      // Release a tab (don't await - let the handoff happen)
      pool.release(tab1);

      // Now the waiting acquire should resolve
      let tab3 = await acquirePromise;
      assert.strictEqual(tab3, tab1);
      assert.strictEqual(pool.stats().waiting, 0);
    });

    it('handles multiple waiters in FIFO order', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1);

      let tab1 = await pool.acquire();

      let order = [];
      let promise1 = pool.acquire().then(tab => {
        order.push(1);
        return tab;
      });
      let promise2 = pool.acquire().then(tab => {
        order.push(2);
        return tab;
      });

      assert.strictEqual(pool.stats().waiting, 2);

      // Release twice (don't await - let handoffs happen)
      pool.release(tab1);
      await promise1;

      pool.release(tab1);
      await promise2;

      assert.deepStrictEqual(order, [1, 2]);
    });
  });

  describe('release', () => {
    it('adds tab back to available pool', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      let tab = await pool.acquire();
      assert.strictEqual(pool.stats().available, 0);

      await pool.release(tab);
      assert.strictEqual(pool.stats().available, 1);
    });

    it('handles null tab gracefully', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      // Should not throw
      await pool.release(null);
      assert.strictEqual(pool.stats().available, 0);
    });

    it('hands off directly to waiting acquirer', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1);

      let tab1 = await pool.acquire();
      let acquirePromise = pool.acquire();

      assert.strictEqual(pool.stats().waiting, 1);
      assert.strictEqual(pool.stats().available, 0);

      // Release hands off directly to waiter
      pool.release(tab1);

      let tab2 = await acquirePromise;
      assert.strictEqual(tab2, tab1);
      // Tab went directly to waiter, not to available
      assert.strictEqual(pool.stats().available, 0);
      assert.strictEqual(pool.stats().waiting, 0);
    });
  });

  describe('drain', () => {
    it('closes all available contexts', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      let page1 = await pool.acquire();
      let page2 = await pool.acquire();
      await pool.release(page1);
      await pool.release(page2);

      assert.strictEqual(pool.stats().available, 2);

      await pool.drain();

      // Context close is called, not page close
      assert.strictEqual(page1._poolEntry.context.close.mock.callCount(), 1);
      assert.strictEqual(page2._poolEntry.context.close.mock.callCount(), 1);
      assert.strictEqual(pool.stats().available, 0);
      assert.strictEqual(pool.stats().total, 0);
    });

    it('resolves waiting acquirers with null', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1);

      await pool.acquire();
      let acquirePromise = pool.acquire();

      assert.strictEqual(pool.stats().waiting, 1);

      await pool.drain();

      let result = await acquirePromise;
      assert.strictEqual(result, null);
      assert.strictEqual(pool.stats().waiting, 0);
    });

    it('handles close errors gracefully', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 2);

      let page1 = await pool.acquire();
      let page2 = await pool.acquire();

      // Make first context throw on close
      page1._poolEntry.context.close = mock.fn(async () => {
        throw new Error('Close failed');
      });

      await pool.release(page1);
      await pool.release(page2);

      // Should not throw
      await pool.drain();

      assert.strictEqual(page1._poolEntry.context.close.mock.callCount(), 1);
      assert.strictEqual(page2._poolEntry.context.close.mock.callCount(), 1);
    });
  });

  describe('concurrent usage', () => {
    it('handles rapid acquire/release cycles', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      // Simulate rapid concurrent usage
      let tasks = Array.from({ length: 10 }, async (_, i) => {
        let tab = await pool.acquire();
        // Simulate some work with setImmediate (Node.js)
        await new Promise(resolve => setImmediate(resolve));
        await pool.release(tab);
        return i;
      });

      let results = await Promise.all(tasks);

      assert.strictEqual(results.length, 10);
      // Should have created at most 3 tabs
      assert.ok(browser.getPageCount() <= 3);
    });
  });

  describe('tab recycling', () => {
    it('recycles tab after N uses', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1, { recycleAfter: 3 });

      // First tab created
      let tab1 = await pool.acquire();
      let originalId = tab1.id;
      assert.strictEqual(browser.getNewPageCalls(), 1);

      // Use 1
      await pool.release(tab1);

      // Use 2
      let tab2 = await pool.acquire();
      assert.strictEqual(tab2.id, originalId);
      await pool.release(tab2);

      // Use 3 - triggers recycling
      let tab3 = await pool.acquire();
      assert.strictEqual(tab3.id, originalId);
      await pool.release(tab3);

      // Now acquire should get a fresh tab (recycled)
      let tab4 = await pool.acquire();
      assert.notStrictEqual(tab4.id, originalId);
      assert.strictEqual(browser.getNewPageCalls(), 2);
    });

    it('tracks recycled count in stats', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1, { recycleAfter: 2 });

      assert.strictEqual(pool.stats().recycled, 0);

      let tab = await pool.acquire();
      await pool.release(tab); // use 1

      tab = await pool.acquire();
      await pool.release(tab); // use 2 - triggers recycle

      assert.strictEqual(pool.stats().recycled, 1);

      // Do it again
      tab = await pool.acquire();
      await pool.release(tab); // use 1

      tab = await pool.acquire();
      await pool.release(tab); // use 2 - triggers recycle

      assert.strictEqual(pool.stats().recycled, 2);
    });

    it('closes old context during recycling', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1, { recycleAfter: 2 });

      let page = await pool.acquire();
      await pool.release(page); // use 1

      page = await pool.acquire();
      assert.strictEqual(page._poolEntry.context.close.mock.callCount(), 0);

      await pool.release(page); // use 2 - triggers recycle

      assert.strictEqual(page._poolEntry.context.close.mock.callCount(), 1);
    });

    it('hands off fresh tab to waiting acquirer during recycling', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1, { recycleAfter: 2 });

      let tab = await pool.acquire();
      await pool.release(tab); // use 1

      tab = await pool.acquire();
      let originalId = tab.id;

      // Someone is waiting
      let acquirePromise = pool.acquire();

      // Release triggers recycle
      await pool.release(tab); // use 2

      let newTab = await acquirePromise;
      assert.notStrictEqual(newTab.id, originalId);
    });

    it('reduces total count when new context creation fails during recycling', async () => {
      let callCount = 0;
      let browser = {
        newContext: mock.fn(async () => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Failed to create context');
          }
          return createMockContext(callCount);
        }),
      };

      let pool = createTabPool(browser, 1, { recycleAfter: 2 });

      let page = await pool.acquire();
      assert.strictEqual(pool.stats().total, 1);

      await pool.release(page); // use 1

      page = await pool.acquire();
      await pool.release(page); // use 2 - triggers recycle, new context fails

      // Total should be reduced since we couldn't create replacement
      assert.strictEqual(pool.stats().total, 0);
    });

    it('ignores close errors during recycling', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1, { recycleAfter: 2 });

      let page = await pool.acquire();
      page._poolEntry.context.close = mock.fn(async () => {
        throw new Error('Close failed');
      });

      await pool.release(page); // use 1

      page = await pool.acquire();
      page._poolEntry.context.close = mock.fn(async () => {
        throw new Error('Close failed');
      });

      // Should not throw despite close error
      await pool.release(page); // use 2 - triggers recycle

      assert.strictEqual(pool.stats().recycled, 1);
    });
  });

  describe('_poolEntry metadata', () => {
    it('preserves _poolEntry reference on page', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 2);

      let page = await pool.acquire();

      assert.ok(page._poolEntry);
      assert.strictEqual(page._poolEntry.page, page);
      assert.strictEqual(page._poolEntry.useCount, 1);
    });

    it('increments useCount on each acquire', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1);

      let tab = await pool.acquire();
      assert.strictEqual(tab._poolEntry.useCount, 1);

      await pool.release(tab);

      tab = await pool.acquire();
      assert.strictEqual(tab._poolEntry.useCount, 2);

      await pool.release(tab);

      tab = await pool.acquire();
      assert.strictEqual(tab._poolEntry.useCount, 3);
    });

    it('increments useCount when handing off to waiter', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1);

      let tab = await pool.acquire();
      assert.strictEqual(tab._poolEntry.useCount, 1);

      // Someone is waiting
      let acquirePromise = pool.acquire();

      // Release hands off directly to waiter
      pool.release(tab);

      let sameTab = await acquirePromise;
      assert.strictEqual(sameTab, tab);
      assert.strictEqual(tab._poolEntry.useCount, 2);
    });
  });
});
