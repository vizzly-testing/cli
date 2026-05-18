import assert from 'node:assert';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { fetchWithTimeout } from '../../src/utils/fetch-utils.js';

function createManualTimers() {
  let timers = new Map();
  let nextId = 1;

  return {
    setTimeout(fn, ms) {
      let id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    trigger(id) {
      let timer = timers.get(id);
      timers.delete(id);
      timer?.fn();
    },
    get(id) {
      return timers.get(id);
    },
  };
}

function createAbortableFetch() {
  let calls = [];

  return {
    calls,
    fetch(url, options) {
      calls.push({ url, options });

      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          let error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
  };
}

describe('utils/fetch-utils', () => {
  let server;
  let serverPort;

  before(async () => {
    // Create a simple test server
    server = http.createServer((req, res) => {
      if (req.url === '/fast') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/slow') {
        // Don't respond - let it timeout
      }
    });

    await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('fetchWithTimeout', () => {
    it('completes successful request', async () => {
      let response = await fetchWithTimeout(
        `http://127.0.0.1:${serverPort}/fast`
      );

      assert.strictEqual(response.status, 200);
      let data = await response.json();
      assert.strictEqual(data.status, 'ok');
    });

    it('passes options to fetch', async () => {
      let response = await fetchWithTimeout(
        `http://127.0.0.1:${serverPort}/fast`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );

      assert.strictEqual(response.status, 200);
    });

    it('aborts on timeout without waiting on wall-clock time', async () => {
      let timers = createManualTimers();
      let abortableFetch = createAbortableFetch();

      let request = fetchWithTimeout('/slow', {}, 50, {
        fetch: abortableFetch.fetch,
        timers,
      });

      assert.strictEqual(timers.get(1).ms, 50);
      assert.strictEqual(abortableFetch.calls[0].url, '/slow');
      assert.strictEqual(abortableFetch.calls[0].options.signal.aborted, false);

      timers.trigger(1);

      await assert.rejects(request, error => {
        assert.strictEqual(error.name, 'AbortError');
        return true;
      });
      assert.strictEqual(timers.get(1), undefined);
    });

    it('uses default timeout when not specified', async () => {
      // Just verify it doesn't throw for fast requests with default timeout
      let response = await fetchWithTimeout(
        `http://127.0.0.1:${serverPort}/fast`
      );

      assert.strictEqual(response.status, 200);
    });
  });
});
