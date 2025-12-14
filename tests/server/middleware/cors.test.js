import assert from 'node:assert';
import { describe, it } from 'node:test';
import { corsMiddleware } from '../../../src/server/middleware/cors.js';

/**
 * Creates a mock HTTP request
 */
function createMockRequest(method = 'GET') {
  return { method };
}

/**
 * Creates a mock HTTP response with header tracking
 */
function createMockResponse() {
  let headers = {};
  let ended = false;
  let statusCode = null;

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
    end() {
      ended = true;
    },
    get headers() {
      return headers;
    },
    get ended() {
      return ended;
    },
  };
}

describe('server/middleware/cors', () => {
  describe('corsMiddleware', () => {
    it('sets CORS headers on response', () => {
      let req = createMockRequest('GET');
      let res = createMockResponse();

      corsMiddleware(req, res);

      assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), '*');
      assert.strictEqual(
        res.getHeader('Access-Control-Allow-Methods'),
        'GET, POST, OPTIONS'
      );
      assert.strictEqual(
        res.getHeader('Access-Control-Allow-Headers'),
        'Content-Type'
      );
    });

    it('returns false for GET requests', () => {
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = corsMiddleware(req, res);

      assert.strictEqual(result, false);
      assert.strictEqual(res.ended, false);
    });

    it('returns false for POST requests', () => {
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = corsMiddleware(req, res);

      assert.strictEqual(result, false);
      assert.strictEqual(res.ended, false);
    });

    it('handles OPTIONS preflight and returns true', () => {
      let req = createMockRequest('OPTIONS');
      let res = createMockResponse();

      let result = corsMiddleware(req, res);

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.ended, true);
    });

    it('sets CORS headers even for OPTIONS requests', () => {
      let req = createMockRequest('OPTIONS');
      let res = createMockResponse();

      corsMiddleware(req, res);

      assert.strictEqual(res.getHeader('Access-Control-Allow-Origin'), '*');
    });
  });
});
