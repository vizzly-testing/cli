import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createHttpServer } from './http-server.js';

/**
 * Make an HTTP request to the server
 */
async function request(server, path, options = {}) {
  let { port } = server.getServer().address();
  let url = `http://127.0.0.1:${port}${path}`;
  let response = await fetch(url, options);
  let text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

describe('server/http-server', () => {
  let testDir = join(process.cwd(), '.test-http-server');
  let originalCwd = process.cwd();
  let server = null;
  let testPort = 0; // Let the OS assign an available port.

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(join(testDir, '.vizzly', 'baselines'), { recursive: true });
    process.chdir(testDir);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createHttpServer', () => {
    it('creates server that can start and stop', async () => {
      server = createHttpServer(testPort, null);

      await server.start();
      assert.ok(server.getServer());

      await server.stop();
      assert.strictEqual(server.getServer(), null);
    });

    it('handles /health endpoint', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(server, '/health');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.port, testPort);
    });

    it('handles CORS preflight requests', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(server, '/health', { method: 'OPTIONS' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
    });

    it('returns 404 for unknown routes', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(server, '/unknown/route');

      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error);
    });

    it('serves dashboard routes', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(server, '/');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('<!DOCTYPE html>'));
    });

    it('serves /api/events SSE endpoint', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ comparisons: [], summary: { total: 0 } })
      );

      server = createHttpServer(testPort, null);
      await server.start();

      let { port } = server.getServer().address();
      let res = await fetch(`http://127.0.0.1:${port}/api/events`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Content-Type'), 'text/event-stream');

      // Close the connection
      await res.body.cancel();
    });

    it('serves /api/report-data endpoint', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ comparisons: [], summary: { total: 0 } })
      );

      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(server, '/api/report-data');

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.comparisons, []);
    });

    it('returns 503 for config routes without configService', async () => {
      server = createHttpServer(testPort, null, {});
      await server.start();

      let res = await request(server, '/api/config');

      assert.strictEqual(res.status, 503);
    });

    it('returns 503 for auth routes without authService', async () => {
      server = createHttpServer(testPort, null, {});
      await server.start();

      let res = await request(server, '/api/auth/status');

      assert.strictEqual(res.status, 503);
    });

    it('returns 503 for projects routes without projectService', async () => {
      server = createHttpServer(testPort, null, {});
      await server.start();

      let res = await request(server, '/api/projects');

      assert.strictEqual(res.status, 503);
    });

    it('finishBuild returns null when no screenshotHandler', async () => {
      server = createHttpServer(testPort, null);

      let result = await server.finishBuild('build-123');

      assert.strictEqual(result, null);
    });

    it('finishBuild calls flush on screenshotHandler', async () => {
      let flushed = false;
      let screenshotHandler = {
        flush: async () => {
          flushed = true;
          return { uploaded: 5, failed: 0 };
        },
      };

      server = createHttpServer(testPort, screenshotHandler);

      let result = await server.finishBuild('build-123');

      assert.strictEqual(flushed, true);
      assert.strictEqual(result.uploaded, 5);
    });

    it('rejects on port already in use', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let { port } = server.getServer().address();
      let server2 = createHttpServer(port, null);

      await assert.rejects(server2.start(), /already in use/);
    });
  });
});
