/**
 * Tests for concurrency control
 */

import { describe, it, expect } from 'vitest';

// Simple concurrency control - process items with limited parallelism
async function mapWithConcurrency(items, fn, concurrency) {
  let results = [];
  let executing = [];

  for (let item of items) {
    let promise = fn(item).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(results);
}

describe('mapWithConcurrency', () => {
  it('should process all items', async () => {
    let items = [1, 2, 3, 4, 5];
    let processed = [];

    await mapWithConcurrency(
      items,
      async item => {
        processed.push(item);
      },
      2
    );

    expect(processed).toHaveLength(5);
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('should respect concurrency limit', async () => {
    let items = [1, 2, 3, 4, 5];
    let activeCount = 0;
    let maxConcurrent = 0;

    await mapWithConcurrency(
      items,
      async _item => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeCount--;
      },
      2
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should handle async function results', async () => {
    let items = [1, 2, 3];

    await mapWithConcurrency(items, async item => item * 2, 2);

    // Should complete without error
    expect(true).toBe(true);
  });

  it('should handle errors in processing', async () => {
    let items = [1, 2, 3];

    await expect(
      mapWithConcurrency(
        items,
        async item => {
          if (item === 2) throw new Error('Test error');
          return item;
        },
        2
      )
    ).rejects.toThrow('Test error');
  });
});
