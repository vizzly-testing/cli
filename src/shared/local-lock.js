import { createHash } from 'node:crypto';
import { createConnection, createServer } from 'node:net';

function lockError(message) {
  let error = new Error(message);
  error.code = 'LOCAL_LOCK_UNAVAILABLE';
  return error;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

async function waitForOwner(port, signal) {
  return await new Promise((resolve, reject) => {
    let socket = createConnection({ host: '127.0.0.1', port });
    let handshake = AbortSignal.timeout(2000);
    let received = '';
    let verified = false;
    let finish = error => {
      handshake.removeEventListener('abort', expired);
      signal?.removeEventListener('abort', aborted);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    let expired = () => {
      if (!verified)
        finish(lockError('Another local service occupies the lock address.'));
    };
    let aborted = () => finish(signal.reason);
    handshake.addEventListener('abort', expired, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    socket.on('data', data => {
      received += data.toString();
      if (
        received.length > 86 ||
        (received.includes('\n') &&
          !/^vizzly-local-lock-v1 [a-f0-9]{64}\n$/.test(received))
      ) {
        finish(lockError('Another local service occupies the lock address.'));
      } else if (/^vizzly-local-lock-v1 [a-f0-9]{64}\n$/.test(received)) {
        verified = true;
        handshake.removeEventListener('abort', expired);
      }
    });
    socket.once('error', error => {
      finish(
        error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET'
          ? null
          : error
      );
    });
    socket.once('close', () => finish());
    if (signal?.aborted) aborted();
  });
}

/** Kernel-held process lock; owner death closes waiting sockets automatically. */
export async function withLocalLock(key, operation, { signal } = {}) {
  let deadline = AbortSignal.timeout(60000);
  let waitingSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let identity = createHash('sha256').update(key).digest('hex');
  let port = 20000 + (Number.parseInt(identity.slice(0, 8), 16) % 40000);
  for (let attempts = 0; attempts < 64; attempts++) {
    if (deadline.aborted && !signal?.aborted) {
      throw lockError(
        'Timed out waiting for another local operation. Try again.'
      );
    }
    waitingSignal.throwIfAborted();
    let sockets = new Set();
    let server = createServer(socket => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => sockets.delete(socket));
      socket.write(`vizzly-local-lock-v1 ${identity}\n`);
    });
    try {
      await listen(server, port);
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      try {
        await waitForOwner(port, waitingSignal);
      } catch (waitError) {
        if (deadline.aborted && !signal?.aborted) {
          throw lockError(
            'Timed out waiting for another local operation. Try again.'
          );
        }
        throw waitError;
      }
      continue;
    }
    try {
      return await operation();
    } finally {
      for (let socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  }
  throw lockError('Unable to acquire the local process lock. Try again.');
}
