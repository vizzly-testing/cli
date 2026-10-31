import { setTimeout as delay } from 'node:timers/promises';

/** Wait for the next check, with optional terminal input and a live countdown. */
export async function waitForLoginPoll({
  milliseconds,
  manualAllowed = true,
  earliestCheckAt = 0,
  stdin = process.stdin,
  now = Date.now,
  sleep = delay,
  onTick,
}) {
  if (!stdin.isTTY) {
    onTick(milliseconds, false);
    await sleep(milliseconds);
    return;
  }

  let deadline = now() + milliseconds;
  let requested = false;
  let timer;
  let wasFlowing = stdin.readableFlowing === true;
  let onData = data => {
    if (manualAllowed && /[\r\n]/.test(data.toString())) {
      requested = true;
      timer?.abort();
    }
  };
  if (manualAllowed) {
    stdin.on('data', onData);
    stdin.resume();
  }
  try {
    while (true) {
      let remaining =
        Math.min(deadline, requested ? earliestCheckAt : deadline) - now();
      if (remaining <= 0) return;
      onTick(remaining, manualAllowed && !requested);
      timer = new AbortController();
      try {
        await sleep(Math.min(remaining, 1000), undefined, {
          signal: timer.signal,
        });
      } catch (error) {
        if (!timer.signal.aborted) throw error;
      }
    }
  } finally {
    stdin.removeListener('data', onData);
    if (manualAllowed && !wasFlowing) stdin.pause();
  }
}
