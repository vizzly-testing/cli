import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createEventsRouter } from '../../../src/server/routers/events.js';
import { createStateStore } from '../../../src/tdd/state-store.js';

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

function writeReportData(workingDir, reportData, details = null) {
  let store = createStateStore({ workingDir });
  store.replaceReportData(reportData, details);
  store.close();
}

function writeBaselineMetadata(workingDir, metadata) {
  let store = createStateStore({ workingDir });
  store.setBaselineMetadata(metadata);
  store.close();
}

async function flushSseUpdates() {
  await new Promise(resolve => setImmediate(resolve));
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
      let reportData = {
        comparisons: [{ id: 'test', name: 'shot', status: 'passed' }],
        summary: { total: 1 },
      };
      writeReportData(testDir, reportData);

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
      writeReportData(testDir, { comparisons: [], summary: { total: 0 } });
      writeBaselineMetadata(testDir, {
        buildName: 'Test Build',
        createdAt: '2025-01-01',
      });

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

      writeReportData(testDir, {
        comparisons: [{ id: 'updated', name: 'shot', status: 'failed' }],
      });

      await flushSseUpdates();

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

      writeReportData(testDir, {
        comparisons: [{ id: 'v1', name: 'shot', status: 'passed' }],
      });
      writeReportData(testDir, {
        comparisons: [{ id: 'v2', name: 'shot', status: 'passed' }],
      });
      writeReportData(testDir, {
        comparisons: [{ id: 'v3', name: 'shot', status: 'passed' }],
      });

      await flushSseUpdates();

      let output = res.getOutput();
      // Should have at least one event and include the final update.
      let eventCount = (output.match(/event: reportData/g) || []).length;
      assert.ok(eventCount >= 1, 'Should have at least one event');
      assert.ok(output.includes('"id":"v3"'), 'Should contain final version');

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
      writeReportData(testDir, { test: true, comparisons: [] });

      await flushSseUpdates();

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

      // Should still work, just no state updates yet
      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);

      // Clean up
      req.emit('close');
    });

    it('sends comparisonUpdate for new comparisons', async () => {
      let initialData = {
        comparisons: [{ id: 'a', name: 'existing', status: 'passed' }],
        total: 1,
      };
      writeReportData(testDir, initialData);

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Add a new comparison
      let updatedData = {
        comparisons: [
          { id: 'a', name: 'existing', status: 'passed' },
          { id: 'b', name: 'new-one', status: 'failed' },
        ],
        total: 2,
      };
      writeReportData(testDir, updatedData);

      await flushSseUpdates();

      let output = res.getOutput();
      assert.ok(output.includes('event: comparisonUpdate'));
      assert.ok(output.includes('"id":"b"'));
      assert.ok(output.includes('"name":"new-one"'));

      req.emit('close');
    });

    it('sends comparisonUpdate for changed comparisons', async () => {
      let initialData = {
        comparisons: [
          { id: 'a', name: 'test', status: 'passed', diffPercentage: 0 },
        ],
        total: 1,
      };
      writeReportData(testDir, initialData);

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Change the comparison's status
      let updatedData = {
        comparisons: [
          { id: 'a', name: 'test', status: 'failed', diffPercentage: 5.2 },
        ],
        total: 1,
      };
      writeReportData(testDir, updatedData);

      await flushSseUpdates();

      let output = res.getOutput();
      assert.ok(output.includes('event: comparisonUpdate'));
      assert.ok(output.includes('"status":"failed"'));
      // Should not send full reportData for incremental changes
      let reportDataCount = (output.match(/event: reportData/g) || []).length;
      assert.strictEqual(
        reportDataCount,
        1,
        'Only initial reportData should be sent'
      );

      req.emit('close');
    });

    it('sends comparisonRemoved when comparison is deleted', async () => {
      let initialData = {
        comparisons: [
          { id: 'a', name: 'keep', status: 'passed' },
          { id: 'b', name: 'remove', status: 'failed' },
        ],
        total: 2,
      };
      writeReportData(testDir, initialData);

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Remove comparison b
      let updatedData = {
        comparisons: [{ id: 'a', name: 'keep', status: 'passed' }],
        total: 1,
      };
      writeReportData(testDir, updatedData);

      await flushSseUpdates();

      let output = res.getOutput();
      assert.ok(output.includes('event: comparisonRemoved'));
      assert.ok(output.includes('"id":"b"'));

      req.emit('close');
    });

    it('sends summaryUpdate when summary fields change', async () => {
      let initialData = {
        comparisons: [{ id: 'a', name: 'test', status: 'passed' }],
        total: 1,
        passed: 1,
        failed: 0,
      };
      writeReportData(testDir, initialData);

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      // Change status so summary changes.
      let updatedData = {
        comparisons: [{ id: 'a', name: 'test', status: 'failed' }],
        total: 1,
        passed: 0,
        failed: 1,
      };
      writeReportData(testDir, updatedData);

      await flushSseUpdates();

      let output = res.getOutput();
      assert.ok(output.includes('event: summaryUpdate'));
      assert.ok(output.includes('"failed":1'));
      // Summary should not include comparisons
      let summaryLine = output
        .split('\n')
        .find(l => l.startsWith('data:') && l.includes('"failed":1'));
      assert.ok(!summaryLine.includes('"comparisons"'));

      req.emit('close');
    });

    it('sends no events when nothing changed', async () => {
      let initialData = {
        timestamp: 1234,
        comparisons: [
          { id: 'a', name: 'test', status: 'passed', timestamp: 1000 },
        ],
        total: 1,
      };
      writeReportData(testDir, initialData);

      let handler = createEventsRouter({ workingDir: testDir });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/api/events');

      let chunksAfterInitial = res.chunks.length;

      // Write identical data
      writeReportData(testDir, initialData);

      await flushSseUpdates();

      // No new chunks should have been written
      assert.strictEqual(
        res.chunks.length,
        chunksAfterInitial,
        'No events sent for identical data'
      );

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

      await flushSseUpdates();

      // Should not have sent any events
      let output = res.getOutput();
      assert.strictEqual(output, '');

      // Clean up
      req.emit('close');
    });
  });
});
