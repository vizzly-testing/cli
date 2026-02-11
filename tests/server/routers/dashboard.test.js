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

      it('includes baseline metadata when available', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({ comparisons: [], summary: { total: 0 } })
        );
        writeFileSync(
          join(testDir, '.vizzly', 'baselines', 'metadata.json'),
          JSON.stringify({ buildName: 'Test Build', createdAt: '2025-01-01' })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/report-data');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.baseline.buildName, 'Test Build');
        assert.strictEqual(body.baseline.createdAt, '2025-01-01');
      });

      it('returns null baseline when metadata does not exist', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({ comparisons: [], summary: { total: 0 } })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/report-data');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.baseline, null);
      });
    });

    describe('GET /api/comparison/:id', () => {
      it('returns merged comparison data by id', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({
            comparisons: [
              {
                id: 'comp-1',
                name: 'login-page',
                signature: 'login-page|1280|chrome',
                status: 'failed',
                diffPercentage: 0.5,
                hasDiffClusters: true,
              },
            ],
          })
        );
        writeFileSync(
          join(testDir, '.vizzly', 'comparison-details.json'),
          JSON.stringify({
            'comp-1': {
              diffClusters: [{ x: 10, y: 20, width: 100, height: 50 }],
              confirmedRegions: [{ id: 'r1', label: 'header' }],
              intensityStats: { mean: 0.3 },
            },
          })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/comparison/comp-1');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.id, 'comp-1');
        assert.strictEqual(body.name, 'login-page');
        assert.strictEqual(body.diffPercentage, 0.5);
        // Heavy fields merged in
        assert.strictEqual(body.diffClusters.length, 1);
        assert.strictEqual(body.confirmedRegions.length, 1);
        assert.deepStrictEqual(body.intensityStats, { mean: 0.3 });
      });

      it('returns comparison by signature', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({
            comparisons: [
              {
                id: 'comp-2',
                name: 'home-page',
                signature: 'home-page|1920|firefox',
                status: 'passed',
              },
            ],
          })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/comparison/home-page%7C1920%7Cfirefox');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.id, 'comp-2');
      });

      it('returns comparison by name', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({
            comparisons: [
              { id: 'comp-3', name: 'settings-page', status: 'new' },
            ],
          })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/comparison/settings-page');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.id, 'comp-3');
      });

      it('returns 404 when comparison not found', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({ comparisons: [] })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/comparison/nonexistent');

        assert.strictEqual(res.statusCode, 404);
      });

      it('returns 404 when no report data exists', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        // Remove the report-data.json file (doesn't exist by default in test)
        await handler(req, res, '/api/comparison/any-id');

        assert.strictEqual(res.statusCode, 404);
      });

      it('returns lightweight data when no details file exists', async () => {
        writeFileSync(
          join(testDir, '.vizzly', 'report-data.json'),
          JSON.stringify({
            comparisons: [
              {
                id: 'comp-4',
                name: 'dashboard',
                status: 'passed',
                hasDiffClusters: false,
              },
            ],
          })
        );

        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/comparison/comp-4');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.id, 'comp-4');
        // No heavy fields since no details file
        assert.strictEqual(body.diffClusters, undefined);
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

      it('returns false for removed /dashboard route', async () => {
        let handler = createDashboardRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        let result = await handler(req, res, '/dashboard');

        // /dashboard route was removed - users should use / instead
        assert.strictEqual(result, false);
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
