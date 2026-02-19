import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createHttpServer } from '../../src/server/http-server.js';
import { createStateStore } from '../../src/tdd/state-store.js';

/**
 * Make an HTTP request to the server
 */
async function request(port, path, options = {}) {
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

function writeReportData(workingDir, reportData) {
  let store = createStateStore({ workingDir });
  store.replaceReportData(reportData);
  store.close();
}

describe('server/http-server', () => {
  let testDir = join(process.cwd(), '.test-http-server');
  let originalCwd = process.cwd();
  let server = null;
  let testPort = 47399; // Use a unique port for tests

  beforeEach(() => {
    testPort++; // Increment port to avoid conflicts

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

      let res = await request(testPort, '/health');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.port, testPort);
    });

    it('handles CORS preflight requests', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(testPort, '/health', { method: 'OPTIONS' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
    });

    it('returns 404 for unknown routes', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(testPort, '/unknown/route');

      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error);
    });

    it('serves dashboard routes', async () => {
      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(testPort, '/');

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('<!DOCTYPE html>'));
    });

    it('serves /api/events SSE endpoint', async () => {
      writeReportData(testDir, { comparisons: [], summary: { total: 0 } });

      server = createHttpServer(testPort, null);
      await server.start();

      let res = await fetch(`http://127.0.0.1:${testPort}/api/events`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Content-Type'), 'text/event-stream');

      // Close the connection
      await res.body.cancel();
    });

    it('serves /api/report-data endpoint', async () => {
      writeReportData(testDir, { comparisons: [], summary: { total: 0 } });

      server = createHttpServer(testPort, null);
      await server.start();

      let res = await request(testPort, '/api/report-data');

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.comparisons, []);
    });

    it('returns 503 for config routes without configService', async () => {
      server = createHttpServer(testPort, null, {});
      await server.start();

      let res = await request(testPort, '/api/config');

      assert.strictEqual(res.status, 503);
    });

    it('returns 503 for auth routes without authService', async () => {
      server = createHttpServer(testPort, null, {});
      await server.start();

      let res = await request(testPort, '/api/auth/status');

      assert.strictEqual(res.status, 503);
    });

    it('returns 503 for projects routes without projectService', async () => {
      server = createHttpServer(testPort, null, {});
      await server.start();

      let res = await request(testPort, '/api/projects');

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

      let server2 = createHttpServer(testPort, null);

      await assert.rejects(server2.start(), /already in use/);
    });
  });
});
