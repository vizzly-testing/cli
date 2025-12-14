import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildBadRequestResponse,
  buildErrorResponse,
  buildInternalErrorResponse,
  buildNotFoundResponse,
  buildServerListenOptions,
  buildServerStartedMessage,
  buildServerStoppedMessage,
  buildSuccessResponse,
  extractScreenshotData,
  getEffectiveBuildId,
  isScreenshotEndpoint,
  validateScreenshotRequest,
} from '../../src/screenshot-server/core.js';

describe('screenshot-server/core', () => {
  describe('validateScreenshotRequest', () => {
    it('returns valid for complete request', () => {
      let result = validateScreenshotRequest({
        name: 'test-screenshot',
        image: 'base64-data',
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid when name is missing', () => {
      let result = validateScreenshotRequest({ image: 'base64-data' });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'name and image are required');
    });

    it('returns invalid when image is missing', () => {
      let result = validateScreenshotRequest({ name: 'test-screenshot' });

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'name and image are required');
    });

    it('returns invalid when both are missing', () => {
      let result = validateScreenshotRequest({});

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'name and image are required');
    });

    it('returns invalid for null body', () => {
      let result = validateScreenshotRequest(null);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'name and image are required');
    });

    it('returns invalid for undefined body', () => {
      let result = validateScreenshotRequest(undefined);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'name and image are required');
    });

    it('accepts request with additional properties', () => {
      let result = validateScreenshotRequest({
        name: 'test',
        image: 'data',
        buildId: 'build-123',
        properties: { viewport: '1920x1080' },
      });

      assert.strictEqual(result.valid, true);
    });
  });

  describe('isScreenshotEndpoint', () => {
    it('returns true for POST /screenshot', () => {
      assert.strictEqual(isScreenshotEndpoint('POST', '/screenshot'), true);
    });

    it('returns false for GET /screenshot', () => {
      assert.strictEqual(isScreenshotEndpoint('GET', '/screenshot'), false);
    });

    it('returns false for POST /other', () => {
      assert.strictEqual(isScreenshotEndpoint('POST', '/other'), false);
    });

    it('returns false for POST /screenshots (plural)', () => {
      assert.strictEqual(isScreenshotEndpoint('POST', '/screenshots'), false);
    });

    it('returns false for PUT /screenshot', () => {
      assert.strictEqual(isScreenshotEndpoint('PUT', '/screenshot'), false);
    });

    it('returns false for DELETE /screenshot', () => {
      assert.strictEqual(isScreenshotEndpoint('DELETE', '/screenshot'), false);
    });
  });

  describe('getEffectiveBuildId', () => {
    it('returns provided buildId', () => {
      assert.strictEqual(getEffectiveBuildId('build-123'), 'build-123');
    });

    it('returns default for null', () => {
      assert.strictEqual(getEffectiveBuildId(null), 'default');
    });

    it('returns default for undefined', () => {
      assert.strictEqual(getEffectiveBuildId(undefined), 'default');
    });

    it('returns default for empty string', () => {
      assert.strictEqual(getEffectiveBuildId(''), 'default');
    });
  });

  describe('buildSuccessResponse', () => {
    it('returns correct success response', () => {
      let response = buildSuccessResponse();

      assert.deepStrictEqual(response, {
        status: 200,
        body: { success: true },
      });
    });
  });

  describe('buildErrorResponse', () => {
    it('returns error response with status and message', () => {
      let response = buildErrorResponse(400, 'Bad Request');

      assert.deepStrictEqual(response, {
        status: 400,
        body: { error: 'Bad Request' },
      });
    });

    it('works with any status code', () => {
      let response = buildErrorResponse(503, 'Service Unavailable');

      assert.deepStrictEqual(response, {
        status: 503,
        body: { error: 'Service Unavailable' },
      });
    });
  });

  describe('buildNotFoundResponse', () => {
    it('returns 404 not found response', () => {
      let response = buildNotFoundResponse();

      assert.deepStrictEqual(response, {
        status: 404,
        body: { error: 'Not found' },
      });
    });
  });

  describe('buildBadRequestResponse', () => {
    it('returns 400 response with custom message', () => {
      let response = buildBadRequestResponse('Missing required field');

      assert.deepStrictEqual(response, {
        status: 400,
        body: { error: 'Missing required field' },
      });
    });
  });

  describe('buildInternalErrorResponse', () => {
    it('returns 500 internal error response', () => {
      let response = buildInternalErrorResponse();

      assert.deepStrictEqual(response, {
        status: 500,
        body: { error: 'Internal server error' },
      });
    });
  });

  describe('buildServerListenOptions', () => {
    it('returns port and host from config', () => {
      let config = { server: { port: 8080 } };
      let options = buildServerListenOptions(config);

      assert.deepStrictEqual(options, {
        port: 8080,
        host: '127.0.0.1',
      });
    });

    it('returns default port when not configured', () => {
      let options = buildServerListenOptions({});

      assert.deepStrictEqual(options, {
        port: 3000,
        host: '127.0.0.1',
      });
    });

    it('returns default port for null config', () => {
      let options = buildServerListenOptions(null);

      assert.deepStrictEqual(options, {
        port: 3000,
        host: '127.0.0.1',
      });
    });

    it('returns default port for undefined config', () => {
      let options = buildServerListenOptions(undefined);

      assert.deepStrictEqual(options, {
        port: 3000,
        host: '127.0.0.1',
      });
    });
  });

  describe('buildServerStartedMessage', () => {
    it('includes port in message', () => {
      let message = buildServerStartedMessage(8080);

      assert.strictEqual(
        message,
        'Screenshot server listening on http://127.0.0.1:8080'
      );
    });

    it('works with different ports', () => {
      assert.strictEqual(
        buildServerStartedMessage(3001),
        'Screenshot server listening on http://127.0.0.1:3001'
      );
      assert.strictEqual(
        buildServerStartedMessage(47392),
        'Screenshot server listening on http://127.0.0.1:47392'
      );
    });
  });

  describe('buildServerStoppedMessage', () => {
    it('returns stopped message', () => {
      let message = buildServerStoppedMessage();

      assert.strictEqual(message, 'Screenshot server stopped');
    });
  });

  describe('extractScreenshotData', () => {
    it('extracts name, image, and properties', () => {
      let body = {
        buildId: 'build-123',
        name: 'test-screenshot',
        image: 'base64-data',
        properties: { viewport: '1920x1080', browser: 'chrome' },
      };

      let data = extractScreenshotData(body);

      assert.deepStrictEqual(data, {
        name: 'test-screenshot',
        image: 'base64-data',
        properties: { viewport: '1920x1080', browser: 'chrome' },
      });
    });

    it('excludes buildId from extracted data', () => {
      let body = {
        buildId: 'build-123',
        name: 'test',
        image: 'data',
      };

      let data = extractScreenshotData(body);

      assert.strictEqual('buildId' in data, false);
    });

    it('handles missing properties', () => {
      let body = {
        name: 'test',
        image: 'data',
      };

      let data = extractScreenshotData(body);

      assert.deepStrictEqual(data, {
        name: 'test',
        image: 'data',
        properties: undefined,
      });
    });
  });
});
