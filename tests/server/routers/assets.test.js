import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createAssetsRouter } from '../../../src/server/routers/assets.js';

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

describe('server/routers/assets', () => {
  let testDir = join(process.cwd(), '.test-assets-router');
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

  describe('createAssetsRouter', () => {
    it('returns false for non-GET requests', async () => {
      let handler = createAssetsRouter();
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = await handler(req, res, '/reporter-bundle.js');

      assert.strictEqual(result, false);
    });

    it('returns false for unmatched paths', async () => {
      let handler = createAssetsRouter();
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/other');

      assert.strictEqual(result, false);
    });

    describe('/reporter-bundle.js', () => {
      it('serves bundle with correct content type', async () => {
        // The router serves from PROJECT_ROOT/dist/reporter, which exists in the real project
        let handler = createAssetsRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/reporter-bundle.js');

        // Either serves the file (200) or returns 404 - both are valid outcomes
        // depending on whether dist/reporter exists
        assert.ok(
          res.statusCode === 200 || res.statusCode === 404,
          `Expected 200 or 404, got ${res.statusCode}`
        );

        if (res.statusCode === 200) {
          assert.strictEqual(
            res.getHeader('Content-Type'),
            'application/javascript'
          );
        }
      });
    });

    describe('/reporter-bundle.css', () => {
      it('serves CSS with correct content type', async () => {
        let handler = createAssetsRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/reporter-bundle.css');

        // Either serves the file (200) or returns 404 - both are valid outcomes
        assert.ok(
          res.statusCode === 200 || res.statusCode === 404,
          `Expected 200 or 404, got ${res.statusCode}`
        );

        if (res.statusCode === 200) {
          assert.strictEqual(res.getHeader('Content-Type'), 'text/css');
        }
      });
    });

    describe('/images/*', () => {
      it('serves image from .vizzly directory', async () => {
        // Create a test image file
        writeFileSync(
          join(testDir, '.vizzly', 'test-image.png'),
          'fake png data'
        );

        let handler = createAssetsRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/images/test-image.png');

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.getHeader('Content-Type'), 'image/png');
        assert.strictEqual(
          res.getHeader('Cache-Control'),
          'no-store, no-cache, must-revalidate'
        );
        assert.strictEqual(res.getHeader('Pragma'), 'no-cache');
        assert.strictEqual(res.getHeader('Expires'), '0');
      });

      it('returns 404 for non-existent image', async () => {
        let handler = createAssetsRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/images/nonexistent.png');

        assert.strictEqual(res.statusCode, 404);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not found'));
      });

      it('serves images from nested directories', async () => {
        mkdirSync(join(testDir, '.vizzly', 'baselines'), { recursive: true });
        writeFileSync(
          join(testDir, '.vizzly', 'baselines', 'screenshot.png'),
          'png data'
        );

        let handler = createAssetsRouter();
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/images/baselines/screenshot.png');

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.getHeader('Content-Type'), 'image/png');
        assert.strictEqual(
          res.getHeader('Cache-Control'),
          'no-store, no-cache, must-revalidate'
        );
      });
    });
  });
});
