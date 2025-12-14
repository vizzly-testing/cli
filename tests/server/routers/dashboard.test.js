import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createDashboardRouter } from '../../../src/server/routers/dashboard.js';

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
      return body && typeof body === 'string' ? JSON.parse(body) : body;
    },
  };
}

describe('server/routers/dashboard', () => {
  let testDir = join(process.cwd(), '.test-dashboard-router');
  let originalCwd = process.cwd();

  beforeEach(() => {
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

  describe('createDashboardRouter', () => {
    it('returns false for non-GET requests', async () => {
      let handler = createDashboardRouter();
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = await handler(req, res, '/');

      assert.strictEqual(result, false);
    });

    it('returns false for unmatched paths', async () => {
      let handler = createDashboardRouter();
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/unknown-path');

      assert.strictEqual(result, false);
    });

    describe('GET /api/report-data', () => {
      it('returns report data when file exists', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({ comparisons: [{ id: '1' }], summary: { total: 1 } })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/report-data');

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.getHeader('Content-Type'), 'application/json');
        let body = res.getParsedBody();
        assert.strictEqual(body.comparisons.length, 1);
      });

      it('returns null when report data does not exist', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/report-data');

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body, 'null');
      });
    });

    describe('GET /api/status', () => {
      it('returns status with empty data when no files exist', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.ok(body.timestamp);
        assert.strictEqual(body.baseline, null);
        assert.deepStrictEqual(body.comparisons, []);
        assert.strictEqual(body.summary.total, 0);
      });

      it('returns status with report data', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({
            comparisons: [{ id: '1' }],
            summary: { total: 5, passed: 4, failed: 1, errors: 0 },
          })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.summary.total, 5);
        assert.strictEqual(body.comparisons.length, 1);
      });

      it('returns status with baseline info', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'baselines', 'metadata.json'),
          JSON.stringify({
            buildName: 'Test Build',
            createdAt: '2025-01-01T00:00:00Z',
          })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.baseline.buildName, 'Test Build');
      });

      it('handles invalid JSON in report-data.json gracefully', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          'invalid json'
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.deepStrictEqual(body.comparisons, []);
      });

      it('handles invalid JSON in metadata.json gracefully', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'baselines', 'metadata.json'),
          'invalid json'
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.baseline, null);
      });
    });

    describe('SPA Routes', () => {
      it('serves dashboard HTML for / route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/');

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.getHeader('Content-Type'), 'text/html');
        assert.ok(res.body.includes('<!DOCTYPE html>'));
        assert.ok(res.body.includes('Vizzly Dev Dashboard'));
      });

      it('serves dashboard HTML for /dashboard route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/dashboard');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.includes('<!DOCTYPE html>'));
      });

      it('serves dashboard HTML for /stats route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/stats');

        assert.strictEqual(res.statusCode, 200);
      });

      it('serves dashboard HTML for /settings route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/settings');

        assert.strictEqual(res.statusCode, 200);
      });

      it('serves dashboard HTML for /projects route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/projects');

        assert.strictEqual(res.statusCode, 200);
      });

      it('serves dashboard HTML for /builds route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/builds');

        assert.strictEqual(res.statusCode, 200);
      });

      it('serves dashboard HTML for /comparison/* routes', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/comparison/abc123');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.includes('<!DOCTYPE html>'));
      });

      it('injects report data into HTML when available', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({ comparisons: [{ id: 'test-123' }] })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.includes('VIZZLY_REPORTER_DATA'));
        assert.ok(res.body.includes('test-123'));
      });

      it('handles invalid report data JSON gracefully', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          'invalid json'
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.body.includes('<!DOCTYPE html>'));
      });
    });
  });
});
