/**
 * Tests for concurrency control
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { mapWithConcurrency } from '../src/tasks.js';

describe('mapWithConcurrency', () => {
  it('processes all items', async () => {
    let items = [1, 2, 3, 4, 5];
    let processed = [];

    await mapWithConcurrency(
      items,
      async item => {
        processed.push(item);
      },
      2
    );

    assert.strictEqual(processed.length, 5);
    assert.deepStrictEqual(processed.sort(), [1, 2, 3, 4, 5]);
  });

  it('respects concurrency limit', async () => {
    let items = [1, 2, 3, 4, 5];
    let activeCount = 0;
    let maxConcurrent = 0;

    await mapWithConcurrency(
      items,
      async () => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await new Promise(resolve => setImmediate(resolve));
        activeCount--;
      },
      2
    );

    assert.ok(maxConcurrent <= 2);
  });

  it('handles async function results', async () => {
    let items = [1, 2, 3];

    await mapWithConcurrency(items, async item => item * 2, 2);

    // Should complete without error
    assert.ok(true);
  });

  it('handles errors in processing', async () => {
    let items = [1, 2, 3];

    await assert.rejects(
      mapWithConcurrency(
        items,
        async item => {
          if (item === 2) throw new Error('Test error');
          return item;
        },
        2
      ),
      /Test error/
    );
  });
});
