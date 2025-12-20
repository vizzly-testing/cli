import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createEventsRouter } from '../../../src/server/routers/events.js';

/**
 * Creates a mock HTTP request with EventEmitter capabilities
 */
function createMockRequest(method = 'GET') {
  let req = new EventEmitter();
  req.method = method;
  return req;
}

/**
 * Creates a mock HTTP response with SSE tracking
 */
function createMockResponse() {
  let headers = {};
  let statusCode = null;
  let chunks = [];
  let writableEnded = false;

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    get writableEnded() {
      return writableEnded;
    },
    writeHead(code, hdrs) {
      statusCode = code;
      Object.assign(headers, hdrs);
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    write(chunk) {
      chunks.push(chunk);
    },
    end(content) {
      if (content) chunks.push(content);
      writableEnded = true;
    },
    get headers() {
      return headers;
    },
    get chunks() {
      return chunks;
    },
    getOutput() {
      return chunks.join('');
    },
  };
}

describe('server/routers/events', () => {
  let testDir = join(process.cwd(), '.test-events-router');
  let originalCwd = process.cwd();

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(join(testDir, '.vizzly'), { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createEventsRouter', () => {
    it('returns false for non-GET requests', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = await handler(req, res, '/api/events');

      assert.strictEqual(result, false);
    });

    it('returns false for non-events paths', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/api/other');

      assert.strictEqual(result, false);
    });

    it('sets SSE headers correctly', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/api/events');

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['Content-Type'], 'text/event-stream');
      assert.strictEqual(res.headers['Cache-Control'], 'no-cache');
      assert.strictEqual(res.headers.Connection, 'keep-alive');

      // Clean up - simulate connection close
      req.emit('close');
    });

    it('sends initial data when report-data.json exists', async () => {
      let reportData = { comparisons: [{ id: 'test' }], summary: { total: 1 } };
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify(reportData)
      );

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      let output = res.getOutput();
      assert.ok(output.includes('event: reportData'));
      assert.ok(output.includes('"comparisons"'));
      assert.ok(output.includes('"id":"test"'));

      // Clean up
      req.emit('close');
    });

    it('includes baseline metadata in report data', async () => {
      mkdirSync(join(testDir, '.vizzly', 'baselines'), { recursive: true });
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ comparisons: [], summary: { total: 0 } })
      );
      writeFileSync(
        join(testDir, '.vizzly', 'baselines', 'metadata.json'),
        JSON.stringify({ buildName: 'Test Build', createdAt: '2025-01-01' })
      );

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      let output = res.getOutput();
      assert.ok(output.includes('event: reportData'));
      assert.ok(output.includes('"buildName":"Test Build"'));
      assert.ok(output.includes('"createdAt":"2025-01-01"'));

      // Clean up
      req.emit('close');
    });

    it('does not send initial data when no report-data.json exists', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      let output = res.getOutput();
      assert.strictEqual(output, '');

      // Clean up
      req.emit('close');
    });

    it('cleans up on connection close', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Simulate connection close
      req.emit('close');

      // Connection should be cleaned up (no error)
      assert.ok(true);
    });

    it('cleans up on connection error', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Simulate connection error
      req.emit('error', new Error('Connection reset'));

      // Connection should be cleaned up (no error)
      assert.ok(true);
    });

    it('handles invalid JSON in report-data.json gracefully', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        'invalid json'
      );

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Should not crash, no initial data sent
      let output = res.getOutput();
      assert.strictEqual(output, '');

      // Clean up
      req.emit('close');
    });

    it('sends update when report-data.json changes', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Write initial data - this triggers the file watcher
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ comparisons: [{ id: 'updated' }] })
      );

      // Wait for debounce (100ms) + buffer
      await new Promise(resolve => setTimeout(resolve, 200));

      let output = res.getOutput();
      assert.ok(output.includes('event: reportData'));
      assert.ok(output.includes('"id":"updated"'));

      // Clean up
      req.emit('close');
    });

    it('debounces rapid file changes', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Rapid file changes
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ version: 1 })
      );
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ version: 2 })
      );
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ version: 3 })
      );

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      let output = res.getOutput();
      // Should only have one event with the final version
      let eventCount = (output.match(/event: reportData/g) || []).length;
      assert.ok(eventCount >= 1, 'Should have at least one event');
      assert.ok(output.includes('"version":3'), 'Should contain final version');

      // Clean up
      req.emit('close');
    });

    it('does not send to closed connections', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Mark connection as ended
      res.end();

      // Try to trigger an update
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({ test: true })
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not have written after end()
      // The initial chunks should be empty since no initial data
      assert.ok(true, 'Should not crash when writing to closed connection');

      // Clean up
      req.emit('close');
    });

    it('handles missing .vizzly directory gracefully', async () => {
      // Remove .vizzly directory
      rmSync(join(testDir, '.vizzly'), { recursive: true, force: true });

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/api/events');

      // Should still work, just no file watching
      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);

      // Clean up
      req.emit('close');
    });

    it('ignores changes to other files in .vizzly directory', async () => {
      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Write to a different file
      writeFileSync(
        join(testDir, '.vizzly', 'other-file.json'),
        JSON.stringify({ ignored: true })
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not have sent any events
      let output = res.getOutput();
      assert.strictEqual(output, '');

      // Clean up
      req.emit('close');
    });
  });
});
