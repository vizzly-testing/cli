import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { withLocalLock } from './local-lock.js';

function messageFrom(child) {
  return new Promise((resolve, reject) => {
    let exited = () => {
      cleanup();
      reject(new Error('Lock process exited before sending its state.'));
    };
    let message = value => {
      cleanup();
      resolve(value);
    };
    let cleanup = () => {
      child.removeListener('exit', exited);
      child.removeListener('message', message);
    };
    child.once('message', message);
    child.once('exit', exited);
  });
}

test('a crashed lock owner releases its waiting processes without filesystem recovery', async t => {
  let home = await mkdtemp(join(tmpdir(), 'vizzly-process-lock-'));
  let filename = join(home, 'lock.js');
  let moduleUrl = new URL('./local-lock.js', import.meta.url).href;
  await writeFile(
    filename,
    `import { once } from 'node:events';\nimport { withLocalLock } from ${JSON.stringify(moduleUrl)};\nlet key=process.argv[2]; process.send('started'); await withLocalLock(key,async()=>{let release=once(process,'message'); process.send('acquired'); await release;}); process.send('released'); process.disconnect();`
  );
  let key = randomUUID();
  let owner = fork(filename, [key], { execArgv: [], silent: true });
  let waiter;
  t.after(async () => {
    owner.kill();
    waiter?.kill();
    await rm(home, { recursive: true, force: true });
  });
  assert.equal(await messageFrom(owner), 'started');
  assert.equal(await messageFrom(owner), 'acquired');
  waiter = fork(filename, [key], { execArgv: [], silent: true });
  assert.equal(await messageFrom(waiter), 'started');
  let acquired = messageFrom(waiter);
  let ownerExit = once(owner, 'exit');
  owner.kill('SIGKILL');
  await ownerExit;
  assert.equal(await acquired, 'acquired');
  let released = messageFrom(waiter);
  let exit = once(waiter, 'exit');
  waiter.send('release');
  assert.equal(await released, 'released');
  assert.equal((await exit)[0], 0);
});

test('independent callers enter an exclusive operation one at a time', async () => {
  let key = randomUUID();
  let active = 0;
  let visits = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      withLocalLock(key, async () => {
        active++;
        assert.equal(active, 1);
        await Promise.resolve();
        visits++;
        active--;
      })
    )
  );
  assert.equal(visits, 12);
});

test('another Vizzly lock identity on the same port is allowed to finish before acquisition', async () => {
  let key = randomUUID();
  let identity = createHash('sha256').update(key).digest('hex');
  let port = 20000 + (Number.parseInt(identity.slice(0, 8), 16) % 40000);
  let server = createServer(socket => {
    socket.end(`vizzly-local-lock-v1 ${'0'.repeat(64)}\n`);
    server.close();
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  let closed = once(server, 'close');
  assert.equal(await withLocalLock(key, async () => 'acquired'), 'acquired');
  await closed;
});

test('an acquisition deadline leaves the current owner in control of its operation', async t => {
  let deadline = new AbortController();
  let timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', duration =>
    duration === 60000 ? deadline.signal : timeout(duration)
  );
  let release;
  let entered;
  let gate = new Promise(resolve => {
    release = resolve;
  });
  let started = new Promise(resolve => {
    entered = resolve;
  });
  let ownerFinished = false;
  let key = randomUUID();
  let owner = withLocalLock(key, async () => {
    entered();
    await gate;
    ownerFinished = true;
  });
  await started;
  let waiting = withLocalLock(key, async () => {
    assert.fail('a waiter took the owned lock');
  });
  deadline.abort(
    new DOMException('Acquisition deadline reached', 'TimeoutError')
  );
  await assert.rejects(() => waiting, { code: 'LOCAL_LOCK_UNAVAILABLE' });
  assert.equal(ownerFinished, false);
  release();
  await owner;
  assert.equal(ownerFinished, true);
});
