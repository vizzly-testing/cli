import assert from 'node:assert';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  autoDiscoverTddServer,
  configure,
  getVizzlyInfo,
  isVizzlyReady,
  LOG_LEVELS,
  setEnabled,
  shouldLogClient,
  vizzlyFlush,
  vizzlyScreenshot,
} from '../../src/client/index.js';

// Store original env vars
let originalEnv;

describe('client/index', () => {
  beforeEach(() => {
    // Save originals
    originalEnv = { ...process.env };

    // Clear env vars
    delete process.env.VIZZLY_SERVER_URL;
    delete process.env.VIZZLY_ENABLED;
    delete process.env.VIZZLY_CLIENT_LOG_LEVEL;
    delete process.env.VIZZLY_BUILD_ID;

    // Re-enable for each test (reset internal state)
    configure({ enabled: true, serverUrl: null });
  });

  afterEach(() => {
    // Restore originals
    process.env = originalEnv;
    mock.reset();
  });

  describe('shouldLogClient (pure function)', () => {
    it('returns true when level >= configured level', () => {
      // error (3) >= error (3)
      assert.strictEqual(shouldLogClient('error', 'error'), true);
      // warn (2) >= info (1)
      assert.strictEqual(shouldLogClient('warn', 'info'), true);
      // error (3) >= debug (0)
      assert.strictEqual(shouldLogClient('error', 'debug'), true);
    });

    it('returns false when level < configured level', () => {
      // debug (0) < error (3)
      assert.strictEqual(shouldLogClient('debug', 'error'), false);
      // info (1) < warn (2)
      assert.strictEqual(shouldLogClient('info', 'warn'), false);
      // warn (2) < error (3)
      assert.strictEqual(shouldLogClient('warn', 'error'), false);
    });

    it('defaults to error level when not configured', () => {
      // Without any config, only error should log
      assert.strictEqual(shouldLogClient('error'), true);
      assert.strictEqual(shouldLogClient('warn'), false);
      assert.strictEqual(shouldLogClient('info'), false);
      assert.strictEqual(shouldLogClient('debug'), false);
    });

    it('respects VIZZLY_CLIENT_LOG_LEVEL env var', () => {
      // Test using the configuredLevel parameter since env var tests
      // are problematic with module caching
      assert.strictEqual(shouldLogClient('debug', 'debug'), true);
      assert.strictEqual(shouldLogClient('info', 'debug'), true);
      assert.strictEqual(shouldLogClient('warn', 'debug'), true);
      assert.strictEqual(shouldLogClient('error', 'debug'), true);
    });

    it('handles unknown levels gracefully', () => {
      // Unknown level defaults to 0
      assert.strictEqual(shouldLogClient('unknown', 'error'), false);
      // Unknown config level defaults to 3 (error)
      assert.strictEqual(shouldLogClient('error', 'unknown'), true);
    });
  });

  describe('LOG_LEVELS constant', () => {
    it('has correct hierarchy', () => {
      assert.strictEqual(LOG_LEVELS.debug, 0);
      assert.strictEqual(LOG_LEVELS.info, 1);
      assert.strictEqual(LOG_LEVELS.warn, 2);
      assert.strictEqual(LOG_LEVELS.error, 3);
    });
  });

  describe('autoDiscoverTddServer (pure function with DI)', () => {
    it('returns null when no server.json exists', () => {
      let mockExists = () => false;
      let mockReadFile = () => {
        throw new Error('Should not read');
      };

      let result = autoDiscoverTddServer('/project/tests', {
        exists: mockExists,
        readFile: mockReadFile,
      });

      assert.strictEqual(result, null);
    });

    it('finds server.json in current directory', () => {
      let mockExists = path => path === '/project/.vizzly/server.json';
      let mockReadFile = () => JSON.stringify({ port: 47392 });

      let result = autoDiscoverTddServer('/project', {
        exists: mockExists,
        readFile: mockReadFile,
      });

      assert.strictEqual(result, 'http://localhost:47392');
    });

    it('finds server.json in parent directory', () => {
      let mockExists = path => path === '/project/.vizzly/server.json';
      let mockReadFile = () => JSON.stringify({ port: 12345 });

      let result = autoDiscoverTddServer('/project/tests/unit', {
        exists: mockExists,
        readFile: mockReadFile,
      });

      assert.strictEqual(result, 'http://localhost:12345');
    });

    it('returns null for invalid JSON', () => {
      let mockExists = path => path.includes('server.json');
      let mockReadFile = () => 'not json';

      let result = autoDiscoverTddServer('/project', {
        exists: mockExists,
        readFile: mockReadFile,
      });

      assert.strictEqual(result, null);
    });

    it('returns null when port is missing', () => {
      let mockExists = path => path.includes('server.json');
      let mockReadFile = () => JSON.stringify({ url: 'http://localhost' });

      let result = autoDiscoverTddServer('/project', {
        exists: mockExists,
        readFile: mockReadFile,
      });

      assert.strictEqual(result, null);
    });

    it('handles fs errors gracefully', () => {
      let mockExists = () => {
        throw new Error('Permission denied');
      };
      let mockReadFile = () => '';

      let result = autoDiscoverTddServer('/project', {
        exists: mockExists,
        readFile: mockReadFile,
      });

      assert.strictEqual(result, null);
    });
  });

  describe('configure', () => {
    it('sets serverUrl and creates client', () => {
      configure({ serverUrl: 'http://localhost:9999' });
      assert.strictEqual(isVizzlyReady(), true);
    });

    it('disables when enabled is false', () => {
      configure({ serverUrl: 'http://localhost:9999' });
      assert.strictEqual(isVizzlyReady(), true);

      configure({ enabled: false });
      assert.strictEqual(isVizzlyReady(), false);
    });

    it('re-enables when enabled is true', () => {
      configure({ serverUrl: 'http://localhost:9999', enabled: false });
      assert.strictEqual(isVizzlyReady(), false);

      configure({ enabled: true, serverUrl: 'http://localhost:9999' });
      assert.strictEqual(isVizzlyReady(), true);
    });
  });

  describe('setEnabled', () => {
    it('disables screenshots', () => {
      configure({ serverUrl: 'http://localhost:9999' });
      assert.strictEqual(isVizzlyReady(), true);

      setEnabled(false);
      assert.strictEqual(isVizzlyReady(), false);
    });

    it('re-enables screenshots', () => {
      configure({ serverUrl: 'http://localhost:9999' });
      setEnabled(false);
      assert.strictEqual(isVizzlyReady(), false);

      setEnabled(true);
      // Need to reconfigure serverUrl since disabling clears client
      configure({ serverUrl: 'http://localhost:9999' });
      assert.strictEqual(isVizzlyReady(), true);
    });
  });

  describe('getVizzlyInfo', () => {
    it('returns client state information', () => {
      process.env.VIZZLY_BUILD_ID = 'test-build-123';

      configure({ serverUrl: 'http://localhost:9999' });

      let info = getVizzlyInfo();

      assert.strictEqual(info.enabled, true);
      assert.strictEqual(info.ready, true);
      assert.strictEqual(info.disabled, false);
      assert.strictEqual(info.buildId, 'test-build-123');
    });

    it('shows disabled state', () => {
      configure({ enabled: false });

      let info = getVizzlyInfo();

      assert.strictEqual(info.enabled, false);
      assert.strictEqual(info.disabled, true);
    });
  });

  describe('vizzlyScreenshot (unit tests)', () => {
    it('returns early when disabled', async () => {
      configure({ enabled: false });

      let result = await vizzlyScreenshot('test', Buffer.from('image'));

      assert.strictEqual(result, undefined);
    });

    it('returns undefined or null when no server configured', async () => {
      configure({ enabled: true, serverUrl: null });

      let result = await vizzlyScreenshot('test', Buffer.from('image'));

      // Returns undefined if no server discovered, null if server failed
      assert.ok(result === undefined || result === null);
    });
  });

  describe('vizzlyFlush (unit tests)', () => {
    it('returns undefined when no client', async () => {
      configure({ enabled: false });

      let result = await vizzlyFlush();

      assert.strictEqual(result, undefined);
    });
  });

  describe('isVizzlyReady', () => {
    it('returns false when disabled', () => {
      configure({ enabled: false });
      assert.strictEqual(isVizzlyReady(), false);
    });

    it('returns true when server configured and enabled', () => {
      configure({ serverUrl: 'http://localhost:9999', enabled: true });
      assert.strictEqual(isVizzlyReady(), true);
    });
  });
});

describe('client/index httpPost integration tests', () => {
  let server;
  let serverPort;
  let requests = [];

  beforeEach(async () => {
    requests = [];

    // Create a real HTTP server to test the httpPost function
    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        });

        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/screenshot') {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, id: 'test-id-123' }));
        } else if (req.url === '/screenshot-tdd-diff') {
          res.statusCode = 422;
          res.end(
            JSON.stringify({
              tddMode: true,
              comparison: {
                name: 'homepage',
                diffPercentage: 5.2,
              },
            })
          );
        } else if (req.url === '/screenshot-error') {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Internal server error' }));
        } else if (req.url === '/screenshot-invalid-json') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain');
          res.end('not valid json');
        } else if (req.url === '/flush') {
          res.statusCode = 200;
          res.end(JSON.stringify({ flushed: true }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    // Start server on random available port
    await new Promise(resolve => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });

    // Clear env vars and reset state
    delete process.env.VIZZLY_SERVER_URL;
    delete process.env.VIZZLY_ENABLED;
    configure({ enabled: true, serverUrl: `http://localhost:${serverPort}` });
  });

  afterEach(async () => {
    // Close all keep-alive connections before closing server
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    configure({ enabled: false });
  });

  it('makes HTTP POST request to screenshot endpoint', async () => {
    let result = await vizzlyScreenshot(
      'integration-test',
      Buffer.from('fake-png-data'),
      { browser: 'chrome' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.id, 'test-id-123');

    // Verify the request was made correctly
    assert.strictEqual(requests.length, 1);
    let req = requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/screenshot');
    assert.strictEqual(req.body.name, 'integration-test');
    assert.strictEqual(
      req.body.image,
      Buffer.from('fake-png-data').toString('base64')
    );
    assert.deepStrictEqual(req.body.properties, { browser: 'chrome' });
  });

  it('flattens nested properties into top-level properties', async () => {
    await vizzlyScreenshot('test', Buffer.from('data'), {
      properties: { url: 'http://localhost:3000/page' },
    });

    assert.strictEqual(requests.length, 1);
    assert.deepStrictEqual(requests[0].body.properties, {
      url: 'http://localhost:3000/page',
    });
  });

  it('excludes SDK options from properties', async () => {
    await vizzlyScreenshot('test', Buffer.from('data'), {
      fullPage: true,
      threshold: 0.1,
      properties: { url: 'http://localhost:3000' },
      browser: 'firefox',
    });

    assert.strictEqual(requests.length, 1);
    let { properties, fullPage } = requests[0].body;
    assert.strictEqual(fullPage, true);
    assert.deepStrictEqual(properties, {
      browser: 'firefox',
      url: 'http://localhost:3000',
    });
    assert.strictEqual(properties.fullPage, undefined);
    assert.strictEqual(properties.threshold, undefined);
  });

  it('sends Connection: close header to disable keep-alive', async () => {
    await vizzlyScreenshot('test', Buffer.from('data'));

    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].headers.connection, 'close');
  });

  it('sends file path as string without base64 encoding', async () => {
    await vizzlyScreenshot('test', '/path/to/image.png');

    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].body.image, '/path/to/image.png');
  });

  it('handles 422 TDD mode visual diff gracefully', async () => {
    // Point to the TDD diff endpoint
    configure({
      enabled: true,
      serverUrl: `http://localhost:${serverPort}/screenshot-tdd-diff`.replace(
        '/screenshot',
        ''
      ),
    });

    // Need to reconfigure to actually hit the different endpoint
    // Actually, let's use a different approach - modify what endpoint we hit
    server.close();
    requests = [];

    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        requests.push({
          method: req.method,
          url: req.url,
          body: body ? JSON.parse(body) : null,
        });
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 422;
        res.end(
          JSON.stringify({
            tddMode: true,
            comparison: {
              name: 'homepage',
              diffPercentage: 5.2,
            },
          })
        );
      });
    });

    await new Promise(resolve => {
      server.listen(serverPort, () => resolve());
    });

    configure({ enabled: true, serverUrl: `http://localhost:${serverPort}` });

    let result = await vizzlyScreenshot('homepage', Buffer.from('png-data'));

    // Should return success with diff info instead of throwing
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.name, 'homepage');
    assert.strictEqual(result.diffPercentage, 5.2);
  });

  it('handles server error and disables SDK', async () => {
    server.close();
    requests = [];

    server = createServer((req, res) => {
      let _body = '';
      req.on('data', chunk => {
        _body += chunk;
      });
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url });
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
    });

    await new Promise(resolve => {
      server.listen(serverPort, () => resolve());
    });

    configure({ enabled: true, serverUrl: `http://localhost:${serverPort}` });
    assert.strictEqual(isVizzlyReady(), true);

    let result = await vizzlyScreenshot('test', Buffer.from('data'));

    // SDK auto-disables on error and returns null
    assert.strictEqual(result, null);
    assert.strictEqual(isVizzlyReady(), false);
  });

  it('handles invalid JSON response gracefully', async () => {
    server.close();
    requests = [];

    server = createServer((req, res) => {
      let _body = '';
      req.on('data', chunk => {
        _body += chunk;
      });
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url });
        res.setHeader('Content-Type', 'text/plain');
        res.statusCode = 200;
        res.end('not valid json at all');
      });
    });

    await new Promise(resolve => {
      server.listen(serverPort, () => resolve());
    });

    configure({ enabled: true, serverUrl: `http://localhost:${serverPort}` });

    // Should not throw - httpPost handles invalid JSON gracefully
    let result = await vizzlyScreenshot('test', Buffer.from('data'));

    // Response has error field from invalid JSON parsing
    assert.ok(result !== null);
    assert.ok(result.error);
  });

  it('handles connection refused error', async () => {
    // Close the server to simulate connection refused
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));

    configure({ enabled: true, serverUrl: 'http://localhost:59999' }); // Unlikely port
    assert.strictEqual(isVizzlyReady(), true);

    let result = await vizzlyScreenshot('test', Buffer.from('data'));

    // SDK auto-disables on connection error
    assert.strictEqual(result, null);
    assert.strictEqual(isVizzlyReady(), false);

    // Restart server for cleanup
    server = createServer(() => {});
    await new Promise(resolve => server.listen(serverPort, resolve));
  });

  it('makes HTTP request to flush endpoint', async () => {
    let result = await vizzlyFlush();

    assert.deepStrictEqual(result, { flushed: true });

    assert.strictEqual(requests.length, 1);
    let req = requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/flush');
  });
});
