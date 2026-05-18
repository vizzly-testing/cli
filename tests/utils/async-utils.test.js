import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withTimeout } from '../../src/utils/async-utils.js';

function createManualTimers() {
  let timers = new Map();
  let cleared = [];
  let nextId = 1;

  return {
    setTimeout(fn, ms) {
      let id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      timers.delete(id);
    },
    trigger(id) {
      timers.get(id)?.fn();
    },
    get(id) {
      return timers.get(id);
    },
    get cleared() {
      return cleared;
    },
  };
}

describe('withTimeout', () => {
  it('returns the operation result and clears the timeout', async () => {
    let timers = createManualTimers();

    let result = await withTimeout(
      Promise.resolve('registered'),
      5000,
      'timed out',
      timers
    );

    assert.strictEqual(result, 'registered');
    assert.deepStrictEqual(timers.cleared, [1]);
    assert.strictEqual(timers.get(1), undefined);
  });

  it('rejects with the timeout error when the timer wins', async () => {
    let timers = createManualTimers();
    let promise = withTimeout(new Promise(() => {}), 5000, 'timed out', timers);

    timers.trigger(1);

    await assert.rejects(promise, /timed out/);
    assert.deepStrictEqual(timers.cleared, [1]);
  });

  it('passes through operation errors and clears the timeout', async () => {
    let timers = createManualTimers();
    let error = new Error('registration failed');

    await assert.rejects(
      withTimeout(Promise.reject(error), 5000, 'timed out', timers),
      error
    );

    assert.deepStrictEqual(timers.cleared, [1]);
  });
});
