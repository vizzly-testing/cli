/**
 * Tests for the functional tab pool
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { createTabPool } from '../src/pool.js';

/**
 * Create a mock browser for testing
 */
function createMockBrowser() {
  let pageCount = 0;
  let newPageCalls = 0;

  return {
    newPage: mock.fn(async () => {
      pageCount++;
      newPageCalls++;
      return {
        id: pageCount,
        close: mock.fn(async () => {}),
      };
    }),
    getPageCount: () => pageCount,
    getNewPageCalls: () => newPageCalls,
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
      pool.release(tab1);

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

      // Release a tab
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

      // Release twice
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

      pool.release(tab);
      assert.strictEqual(pool.stats().available, 1);
    });

    it('handles null tab gracefully', () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      // Should not throw
      pool.release(null);
      assert.strictEqual(pool.stats().available, 0);
    });

    it('hands off directly to waiting acquirer', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 1);

      let tab1 = await pool.acquire();
      let acquirePromise = pool.acquire();

      assert.strictEqual(pool.stats().waiting, 1);
      assert.strictEqual(pool.stats().available, 0);

      pool.release(tab1);

      let tab2 = await acquirePromise;
      assert.strictEqual(tab2, tab1);
      // Tab went directly to waiter, not to available
      assert.strictEqual(pool.stats().available, 0);
      assert.strictEqual(pool.stats().waiting, 0);
    });
  });

  describe('drain', () => {
    it('closes all available tabs', async () => {
      let browser = createMockBrowser();
      let pool = createTabPool(browser, 3);

      let tab1 = await pool.acquire();
      let tab2 = await pool.acquire();
      pool.release(tab1);
      pool.release(tab2);

      assert.strictEqual(pool.stats().available, 2);

      await pool.drain();

      assert.strictEqual(tab1.close.mock.callCount(), 1);
      assert.strictEqual(tab2.close.mock.callCount(), 1);
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

      let tab1 = await pool.acquire();
      let tab2 = await pool.acquire();

      // Make first tab throw on close
      tab1.close = mock.fn(async () => {
        throw new Error('Close failed');
      });

      pool.release(tab1);
      pool.release(tab2);

      // Should not throw
      await pool.drain();

      assert.strictEqual(tab1.close.mock.callCount(), 1);
      assert.strictEqual(tab2.close.mock.callCount(), 1);
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
        pool.release(tab);
        return i;
      });

      let results = await Promise.all(tasks);

      assert.strictEqual(results.length, 10);
      // Should have created at most 3 tabs
      assert.ok(browser.getPageCount() <= 3);
    });
  });
});
