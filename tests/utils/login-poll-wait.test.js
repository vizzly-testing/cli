import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { waitForLoginPoll } from '../../src/utils/login-poll-wait.js';

function terminal() {
  let stdin = new PassThrough();
  stdin.isTTY = true;
  return stdin;
}

test('Enter checks early, coalesces repeated input, and restores terminal input', async () => {
  let stdin = terminal();
  let time = 0;
  let countdown = [];
  let sent = false;
  await waitForLoginPoll({
    milliseconds: 5000,
    earliestCheckAt: 1000,
    stdin,
    now: () => time,
    onTick: remaining => countdown.push(remaining),
    sleep: async (milliseconds, _, { signal }) => {
      if (!sent) {
        sent = true;
        stdin.write('\n\n');
        if (signal.aborted) throw new Error('Input interrupted timer');
      }
      time += milliseconds;
    },
  });
  assert.equal(time, 1000);
  assert.deepEqual(countdown, [5000, 1000]);
  assert.equal(stdin.listenerCount('data'), 0);
  assert.equal(stdin.isPaused(), true);
});

test('countdown reaches the scheduled check without input', async () => {
  let time = 0;
  let countdown = [];
  let stdin = terminal();
  await waitForLoginPoll({
    milliseconds: 3000,
    stdin,
    now: () => time,
    onTick: remaining => countdown.push(remaining),
    sleep: async milliseconds => {
      time += milliseconds;
    },
  });
  assert.deepEqual(countdown, [3000, 2000, 1000]);
  assert.equal(time, 3000);
  assert.equal(stdin.listenerCount('data'), 0);
});

test('Enter cannot bypass a server rate-limit cooldown', async () => {
  let stdin = terminal();
  stdin.resume();
  let time = 0;
  let manualHints = [];
  await waitForLoginPoll({
    milliseconds: 3000,
    manualAllowed: false,
    stdin,
    now: () => time,
    onTick: (_, canCheck) => manualHints.push(canCheck),
    sleep: async milliseconds => {
      stdin.write('\n');
      time += milliseconds;
    },
  });
  assert.equal(time, 3000);
  assert.deepEqual(manualHints, [false, false, false]);
  assert.equal(stdin.listenerCount('data'), 0);
  stdin.destroy();
});

test('input listeners are removed if waiting fails', async () => {
  let stdin = terminal();
  await assert.rejects(
    waitForLoginPoll({
      milliseconds: 3000,
      stdin,
      onTick: () => {},
      sleep: async () => {
        throw new Error('Timer failed');
      },
    }),
    /Timer failed/
  );
  assert.equal(stdin.listenerCount('data'), 0);
  assert.equal(stdin.isPaused(), true);
});

test('non-Enter input does not trigger a check and preserves flowing input', async () => {
  let stdin = terminal();
  stdin.resume();
  let time = 0;
  await waitForLoginPoll({
    milliseconds: 3000,
    stdin,
    now: () => time,
    onTick: () => {},
    sleep: async milliseconds => {
      stdin.write('hello');
      time += milliseconds;
    },
  });
  assert.equal(time, 3000);
  assert.equal(stdin.isPaused(), false);
  assert.equal(stdin.listenerCount('data'), 0);
  stdin.destroy();
});

test('closed noninteractive input waits until the scheduled check', async () => {
  let stdin = new PassThrough();
  stdin.end();
  let elapsed = 0;
  let countdown = [];
  await waitForLoginPoll({
    milliseconds: 5000,
    stdin,
    onTick: (remaining, canCheck) => countdown.push({ remaining, canCheck }),
    sleep: async milliseconds => {
      elapsed += milliseconds;
    },
  });
  assert.equal(elapsed, 5000);
  assert.deepEqual(countdown, [{ remaining: 5000, canCheck: false }]);
});
