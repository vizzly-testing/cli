import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createHealthRouter } from '../../../src/server/routers/health.js';

/**
 * Creates a mock HTTP request
 */
function createMockRequest(method = 'GET') {
  return { method };
}

/**
 * Creates a mock HTTP response with tracking
 */
function createMockResponse() {
  let headers = {};
  let statusCode = null;
  let body = null;

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    end(content) {
      body = content;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    getParsedBody() {
      return body ? JSON.parse(body) : null;
    },
  };
}

describe('server/routers/health', () => {
  let testDir = join(process.cwd(), '.test-health-router');
  let originalCwd = process.cwd();

  beforeEach(() => {
    // Create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(join(testDir, '.vizzly', 'baselines'), { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createHealthRouter', () => {
    it('returns false for non-GET requests', async () => {
      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = await handler(req, res, '/health');

      assert.strictEqual(result, false);
    });

    it('returns false for non-health paths', async () => {
      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/other');

      assert.strictEqual(result, false);
    });

    it('returns basic health info', async () => {
      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/health');

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);

      let body = res.getParsedBody();
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.port, 3000);
      assert.strictEqual(body.mode, 'upload');
      assert.ok(body.uptime >= 0);
    });

    it('returns tdd mode when screenshotHandler exists', async () => {
      let handler = createHealthRouter({
        port: 3000,
        screenshotHandler: { handleScreenshot: () => {} },
      });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/health');

      let body = res.getParsedBody();
      assert.strictEqual(body.mode, 'tdd');
    });

    it('includes report stats when report-data.json exists', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        JSON.stringify({
          summary: {
            total: 10,
            passed: 8,
            failed: 1,
            errors: 1,
          },
        })
      );

      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/health');

      let body = res.getParsedBody();
      assert.deepStrictEqual(body.stats, {
        total: 10,
        passed: 8,
        failed: 1,
        errors: 1,
      });
    });

    it('includes baseline info when metadata.json exists', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'baselines', 'metadata.json'),
        JSON.stringify({
          buildName: 'Test Build',
          createdAt: '2025-01-01T00:00:00Z',
        })
      );

      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/health');

      let body = res.getParsedBody();
      assert.deepStrictEqual(body.baseline, {
        buildName: 'Test Build',
        createdAt: '2025-01-01T00:00:00Z',
      });
    });

    it('handles invalid JSON in report-data.json gracefully', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'report-data.json'),
        'not valid json'
      );

      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/health');

      let body = res.getParsedBody();
      assert.strictEqual(body.stats, null);
    });

    it('handles invalid JSON in metadata.json gracefully', async () => {
      writeFileSync(
        join(testDir, '.vizzly', 'baselines', 'metadata.json'),
        'not valid json'
      );

      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/health');

      let body = res.getParsedBody();
      assert.strictEqual(body.baseline, null);
    });

    it('returns null stats when no report data exists', async () => {
      let handler = createHealthRouter({ port: 3000, screenshotHandler: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      await handler(req, res, '/health');

      let body = res.getParsedBody();
      assert.strictEqual(body.stats, null);
      assert.strictEqual(body.baseline, null);
    });
  });
});
