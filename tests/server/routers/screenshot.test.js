import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createScreenshotRouter } from '../../../src/server/routers/screenshot.js';

/**
 * Creates a mock HTTP request with body support
 */
function createMockRequest(method = 'GET', body = null) {
  let emitter = new EventEmitter();
  emitter.method = method;

  // Simulate body if provided
  if (body !== null) {
    process.nextTick(() => {
      emitter.emit('data', JSON.stringify(body));
      emitter.emit('end');
    });
  }

  return emitter;
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

/**
 * Creates a mock screenshot handler
 */
function createMockScreenshotHandler(results = {}) {
  return {
    handleScreenshot: async (buildId, name) => {
      if (results.error) {
        throw results.error;
      }
      return (
        results.screenshot || {
          statusCode: 200,
          body: { success: true, id: `${name}-id` },
        }
      );
    },
    acceptBaseline: results.acceptBaseline
      ? async id => {
          if (results.acceptBaselineError) {
            throw results.acceptBaselineError;
          }
          return { id };
        }
      : undefined,
  };
}

describe('server/routers/screenshot', () => {
  describe('createScreenshotRouter', () => {
    it('returns false for non-POST requests', async () => {
      let handler = createScreenshotRouter({
        screenshotHandler: createMockScreenshotHandler(),
        defaultBuildId: 'build-1',
      });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/screenshot');

      assert.strictEqual(result, false);
    });

    it('returns false for unmatched paths', async () => {
      let handler = createScreenshotRouter({
        screenshotHandler: createMockScreenshotHandler(),
        defaultBuildId: 'build-1',
      });
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = await handler(req, res, '/other');

      assert.strictEqual(result, false);
    });

    describe('/screenshot endpoint', () => {
      it('handles screenshot upload', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler(),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {
          name: 'test-screenshot',
          image: 'base64data',
        });
        let res = createMockResponse();

        let result = await handler(req, res, '/screenshot');

        assert.strictEqual(result, true);
        assert.strictEqual(res.statusCode, 200);

        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
      });

      it('uses buildId from request body', async () => {
        let capturedBuildId;
        let screenshotHandler = {
          handleScreenshot: async buildId => {
            capturedBuildId = buildId;
            return { statusCode: 200, body: { success: true } };
          },
        };

        let handler = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'default-build',
        });
        let req = createMockRequest('POST', {
          buildId: 'custom-build',
          name: 'test',
          image: 'data',
        });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(capturedBuildId, 'custom-build');
      });

      it('falls back to defaultBuildId', async () => {
        let capturedBuildId;
        let screenshotHandler = {
          handleScreenshot: async buildId => {
            capturedBuildId = buildId;
            return { statusCode: 200, body: { success: true } };
          },
        };

        let handler = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'default-build',
        });
        let req = createMockRequest('POST', {
          name: 'test',
          image: 'data',
        });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(capturedBuildId, 'default-build');
      });

      it('returns 400 when name is missing', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler(),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', { image: 'data' });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('name'));
      });

      it('returns 400 when image is missing', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler(),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', { name: 'test' });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('image'));
      });

      it('returns 500 on handler error', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            error: new Error('Processing failed'),
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', { name: 'test', image: 'data' });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Failed to process'));
      });
    });

    describe('/accept-baseline endpoint', () => {
      it('accepts baseline with ID', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptBaseline: true,
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        let result = await handler(req, res, '/accept-baseline');

        assert.strictEqual(result, true);
        assert.strictEqual(res.statusCode, 200);

        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.id, 'comparison-123');
      });

      it('returns 400 when ID is missing', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptBaseline: true,
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/accept-baseline');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('ID'));
      });

      it('returns 501 when acceptBaseline not implemented', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler(), // No acceptBaseline
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/accept-baseline');

        assert.strictEqual(res.statusCode, 501);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not implemented'));
      });

      it('returns 500 on accept error', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptBaseline: true,
            acceptBaselineError: new Error('Accept failed'),
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/accept-baseline');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Failed to accept'));
      });
    });
  });
});
