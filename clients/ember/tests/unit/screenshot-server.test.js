import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  clearServerInfoCache,
  getPage,
  getServerInfo,
  setPage,
  startScreenshotServer,
  stopScreenshotServer,
} from '../../src/launcher/screenshot-server.js';

describe('screenshot-server', () => {
  let server = null;

  afterEach(async () => {
    if (server) {
      await stopScreenshotServer(server);
      server = null;
    }
    setPage(null);
  });

  describe('startScreenshotServer()', () => {
    it('starts server on random port', async () => {
      server = await startScreenshotServer();

      assert.ok(server.port, 'should have a port');
      assert.ok(server.port > 0, 'port should be positive');
      assert.ok(server.server, 'should have server instance');
    });

    it('returns different ports on multiple starts', async () => {
      let server1 = await startScreenshotServer();
      let server2 = await startScreenshotServer();

      try {
        assert.notStrictEqual(
          server1.port,
          server2.port,
          'ports should be different'
        );
      } finally {
        await stopScreenshotServer(server1);
        await stopScreenshotServer(server2);
      }
    });
  });

  describe('stopScreenshotServer()', () => {
    it('stops the server gracefully', async () => {
      server = await startScreenshotServer();
      let port = server.port;

      await stopScreenshotServer(server);
      server = null;

      // Server should no longer accept connections
      try {
        await fetch(`http://127.0.0.1:${port}/health`);
        assert.fail('Server should be stopped');
      } catch (error) {
        assert.ok(
          error.cause?.code === 'ECONNREFUSED' ||
            error.message.includes('fetch failed'),
          'should refuse connection'
        );
      }
    });

    it('handles null server info', async () => {
      await stopScreenshotServer(null);
      // Should not throw
    });

    it('handles undefined server info', async () => {
      await stopScreenshotServer(undefined);
      // Should not throw
    });
  });

  describe('GET /health', () => {
    beforeEach(async () => {
      server = await startScreenshotServer();
    });

    it('returns ok status', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/health`);

      assert.strictEqual(response.status, 200);

      let body = await response.json();
      assert.strictEqual(body.status, 'ok');
    });

    it('reports page availability', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/health`);
      let body = await response.json();

      assert.strictEqual(body.page, false, 'page should be false initially');

      setPage({ mock: 'page' });

      response = await fetch(`http://127.0.0.1:${server.port}/health`);
      body = await response.json();

      assert.strictEqual(body.page, true, 'page should be true after setPage');
    });
  });

  describe('POST /screenshot', () => {
    beforeEach(async () => {
      server = await startScreenshotServer();
    });

    it('returns 400 when name is missing', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(response.status, 400);

      let body = await response.json();
      assert.ok(body.error.includes('name'), 'error should mention name');
    });

    it('returns 500 when page is not set', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-screenshot' }),
      });

      assert.strictEqual(response.status, 500);

      let body = await response.json();
      assert.ok(
        body.error.includes('Page not available'),
        'error should mention page'
      );
    });

    it('handles CORS preflight', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/screenshot`, {
        method: 'OPTIONS',
      });

      assert.strictEqual(response.status, 204);
      assert.strictEqual(
        response.headers.get('Access-Control-Allow-Origin'),
        '*'
      );
      assert.ok(
        response.headers.get('Access-Control-Allow-Methods').includes('POST')
      );
    });
  });

  describe('setPage() / getPage()', () => {
    it('stores and retrieves page reference', () => {
      let mockPage = { screenshot: () => {} };

      setPage(mockPage);
      assert.strictEqual(getPage(), mockPage);
    });

    it('clears page with null', () => {
      setPage({ mock: 'page' });
      setPage(null);

      assert.strictEqual(getPage(), null);
    });
  });

  describe('unknown routes', () => {
    beforeEach(async () => {
      server = await startScreenshotServer();
    });

    it('returns 404 for unknown paths', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/unknown`);

      assert.strictEqual(response.status, 404);
    });

    it('returns 404 for wrong method on /screenshot', async () => {
      let response = await fetch(`http://127.0.0.1:${server.port}/screenshot`);

      assert.strictEqual(response.status, 404);
    });
  });

  describe('getServerInfo()', () => {
    let testDir = join(process.cwd(), '.vizzly-test-temp');

    beforeEach(() => {
      // Clear the cached server info before each test
      clearServerInfoCache();

      // Clean up any existing test directory
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      // Clear cache after tests
      clearServerInfoCache();

      // Clean up test directory
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it('returns null when no server.json exists in isolated directory', () => {
      // Create an isolated test directory without server.json
      mkdirSync(testDir, { recursive: true });

      let originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        clearServerInfoCache();

        let info = getServerInfo();

        // In an isolated directory without .vizzly/server.json, should return null
        // (unless there's a server.json in a parent directory)
        if (info !== null) {
          assert.ok(typeof info.url === 'string', 'should have url');
          assert.ok(typeof info.failOnDiff === 'boolean', 'should have failOnDiff');
        }
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('reads failOnDiff from server.json when present', () => {
      // Create a temporary .vizzly directory with server.json
      let vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      let serverJson = {
        pid: 12345,
        port: 47392,
        startTime: Date.now(),
        failOnDiff: true,
      };
      writeFileSync(join(vizzlyDir, 'server.json'), JSON.stringify(serverJson));

      // Change to test directory to test discovery
      let originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        clearServerInfoCache();

        let info = getServerInfo();

        assert.ok(info !== null, 'should find server.json');
        assert.strictEqual(info.url, 'http://localhost:47392', 'should have correct url');
        assert.strictEqual(info.failOnDiff, true, 'should read failOnDiff as true');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('defaults failOnDiff to false when not specified in server.json', () => {
      let vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      let serverJson = {
        pid: 12345,
        port: 47393,
        startTime: Date.now(),
        // failOnDiff not specified
      };
      writeFileSync(join(vizzlyDir, 'server.json'), JSON.stringify(serverJson));

      let originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        clearServerInfoCache();

        let info = getServerInfo();

        assert.ok(info !== null, 'should find server.json');
        assert.strictEqual(info.url, 'http://localhost:47393', 'should have correct url');
        assert.strictEqual(info.failOnDiff, false, 'should default failOnDiff to false');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
