import assert from 'node:assert';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { createApiHandler } from '../../../src/server/handlers/api-handler.js';
import { createScreenshotRouter } from '../../../src/server/routers/screenshot.js';
import {
  createMockRequest,
  createMockResponse,
} from '../../helpers/http-mocks.js';

/**
 * Creates a mock screenshot handler
 */
function createMockScreenshotHandler(results = {}) {
  return {
    handleScreenshot: async (_buildId, name) => {
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
    getResults: results.getResults
      ? async () => {
          if (results.getResultsError) {
            throw results.getResultsError;
          }
          return results.getResultsData || { total: 0, passed: 0, failed: 0 };
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

      it('passes explicit type to handler when provided', async () => {
        let capturedType;
        let screenshotHandler = {
          handleScreenshot: async (
            _buildId,
            _name,
            _image,
            _properties,
            type
          ) => {
            capturedType = type;
            return { statusCode: 200, body: { success: true } };
          },
        };

        let handler = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {
          name: 'test',
          image: 'base64data',
          type: 'base64',
        });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(capturedType, 'base64');
      });

      it('passes file-path type to handler', async () => {
        let capturedType;
        let screenshotHandler = {
          handleScreenshot: async (
            _buildId,
            _name,
            _image,
            _properties,
            type
          ) => {
            capturedType = type;
            return { statusCode: 200, body: { success: true } };
          },
        };

        let handler = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {
          name: 'test',
          image: '/path/to/file.png',
          type: 'file-path',
        });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(capturedType, 'file-path');
      });

      it('passes undefined type when not provided (backwards compat)', async () => {
        let capturedType = 'not-called';
        let screenshotHandler = {
          handleScreenshot: async (
            _buildId,
            _name,
            _image,
            _properties,
            type
          ) => {
            capturedType = type;
            return { statusCode: 200, body: { success: true } };
          },
        };

        let handler = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {
          name: 'test',
          image: 'base64data',
          // No type field - simulating old client
        });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.strictEqual(capturedType, undefined);
      });

      it('forwards build id, image, properties, type, and warnings unchanged', async () => {
        let capturedArgs = null;
        let screenshotHandler = {
          handleScreenshot: async (...args) => {
            capturedArgs = args;
            return { statusCode: 200, body: { success: true } };
          },
        };
        let properties = {
          browser: 'firefox',
          viewport_width: 1280,
          viewport_height: 720,
        };

        let handler = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'default-build',
        });
        let req = createMockRequest('POST', {
          buildId: 'build-from-sdk',
          name: 'dashboard',
          image: 'base64data',
          properties,
          type: 'base64',
          warnings: [{ code: 'reserved-property-option', option: 'threshold' }],
          threshold: 0,
          minClusterSize: 2,
          fullPage: false,
        });
        let res = createMockResponse();

        await handler(req, res, '/screenshot');

        assert.deepStrictEqual(capturedArgs, [
          'build-from-sdk',
          'dashboard',
          'base64data',
          properties,
          'base64',
          [{ code: 'reserved-property-option', option: 'threshold' }],
          {
            threshold: 0,
            minClusterSize: 2,
            fullPage: false,
            captureMode: undefined,
            deviceScaleFactor: undefined,
            selector: undefined,
          },
        ]);
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

    describe('/flush endpoint', () => {
      it('reports complete and failed uploads through HTTP flush responses', async t => {
        let screenshotHandler = createApiHandler({
          request: async (_path, options) => {
            let body = JSON.parse(options.body);
            if (body.name === 'Checkout: empty cart') {
              throw new Error('Image could not be decoded');
            }
            return body.image_data
              ? { id: 'screenshot-1' }
              : { upload_required: true };
          },
        });
        let route = createScreenshotRouter({
          screenshotHandler,
          defaultBuildId: 'build-1',
        });
        let server = createServer(async (req, res) => {
          await route(req, res, req.url);
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        t.after(async () => {
          server.closeAllConnections();
          await new Promise(resolve => server.close(resolve));
          screenshotHandler.cleanup();
        });
        let url = `http://127.0.0.1:${server.address().port}`;
        async function post(path, body = {}) {
          let response = await fetch(url + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          assert.strictEqual(response.status, 200);
          return response.json();
        }

        await post('/screenshot', {
          name: 'Checkout: populated cart',
          image: 'aGVsbG8=',
          type: 'base64',
        });
        assert.deepStrictEqual(await post('/flush'), {
          success: true,
          uploaded: 1,
          reused: 0,
          failed: 0,
          total: 1,
          failures: [],
        });

        await post('/screenshot', {
          name: 'Checkout: empty cart',
          image: 'aGVsbG8=',
          type: 'base64',
        });
        assert.deepStrictEqual(await post('/flush'), {
          success: false,
          uploaded: 1,
          reused: 0,
          failed: 1,
          total: 2,
          failures: [
            {
              name: 'Checkout: empty cart',
              error: 'Image could not be decoded',
            },
          ],
        });
      });

      it('returns summary when getResults is available', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            getResults: true,
            getResultsData: {
              total: 10,
              passed: 7,
              failed: 2,
              new: 1,
              errors: 0,
            },
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        let result = await handler(req, res, '/flush');

        assert.strictEqual(result, true);
        assert.strictEqual(res.statusCode, 200);

        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.deepStrictEqual(body.summary, {
          total: 10,
          passed: 7,
          failed: 2,
          new: 1,
          errors: 0,
        });
      });

      it('returns success with message when getResults not implemented', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler(), // No getResults
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        let result = await handler(req, res, '/flush');

        assert.strictEqual(result, true);
        assert.strictEqual(res.statusCode, 200);

        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.message, 'No TDD results');
      });

      it('handles missing summary fields with defaults', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            getResults: true,
            getResultsData: {}, // Empty results
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/flush');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.deepStrictEqual(body.summary, {
          total: 0,
          passed: 0,
          failed: 0,
          new: 0,
          errors: 0,
        });
      });

      it('returns 500 on getResults error', async () => {
        let handler = createScreenshotRouter({
          screenshotHandler: createMockScreenshotHandler({
            getResults: true,
            getResultsError: new Error('Results fetch failed'),
          }),
          defaultBuildId: 'build-1',
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/flush');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Failed to flush'));
      });
    });
  });
});
