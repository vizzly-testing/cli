import assert from 'node:assert';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { fetchWithTimeout } from '../../src/utils/fetch-utils.js';

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

    it('aborts on timeout', async () => {
      await assert.rejects(
        fetchWithTimeout(
          `http://127.0.0.1:${serverPort}/slow`,
          {},
          50 // 50ms timeout
        ),
        error => {
          // AbortError or similar
          return error.name === 'AbortError' || error.message.includes('abort');
        }
      );
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
