import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  sendError,
  sendFile,
  sendHtml,
  sendJson,
  sendNotFound,
  sendServiceUnavailable,
  sendSuccess,
} from '../../../src/server/middleware/response.js';

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
  };
}

describe('server/middleware/response', () => {
  describe('sendJson', () => {
    it('sends JSON with correct content type', () => {
      let res = createMockResponse();

      sendJson(res, 200, { message: 'hello' });

      assert.strictEqual(res.getHeader('Content-Type'), 'application/json');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, '{"message":"hello"}');
    });

    it('sends JSON with custom status code', () => {
      let res = createMockResponse();

      sendJson(res, 201, { created: true });

      assert.strictEqual(res.statusCode, 201);
    });

    it('handles complex objects', () => {
      let res = createMockResponse();
      let data = {
        array: [1, 2, 3],
        nested: { a: 'b' },
        number: 42,
      };

      sendJson(res, 200, data);

      assert.deepStrictEqual(JSON.parse(res.body), data);
    });
  });

  describe('sendSuccess', () => {
    it('sends 200 with data', () => {
      let res = createMockResponse();

      sendSuccess(res, { result: 'ok' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.getHeader('Content-Type'), 'application/json');
      assert.deepStrictEqual(JSON.parse(res.body), { result: 'ok' });
    });

    it('sends empty object by default', () => {
      let res = createMockResponse();

      sendSuccess(res);

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(res.body), {});
    });
  });

  describe('sendError', () => {
    it('sends error with status code and message', () => {
      let res = createMockResponse();

      sendError(res, 400, 'Bad request');

      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(JSON.parse(res.body), { error: 'Bad request' });
    });

    it('sends 500 error', () => {
      let res = createMockResponse();

      sendError(res, 500, 'Internal server error');

      assert.strictEqual(res.statusCode, 500);
      assert.deepStrictEqual(JSON.parse(res.body), {
        error: 'Internal server error',
      });
    });
  });

  describe('sendNotFound', () => {
    it('sends 404 with default message', () => {
      let res = createMockResponse();

      sendNotFound(res);

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(JSON.parse(res.body), { error: 'Not found' });
    });

    it('sends 404 with custom message', () => {
      let res = createMockResponse();

      sendNotFound(res, 'Resource not found');

      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(JSON.parse(res.body), {
        error: 'Resource not found',
      });
    });
  });

  describe('sendServiceUnavailable', () => {
    it('sends 503 with service name', () => {
      let res = createMockResponse();

      sendServiceUnavailable(res, 'Database');

      assert.strictEqual(res.statusCode, 503);
      assert.deepStrictEqual(JSON.parse(res.body), {
        error: 'Database not available',
      });
    });
  });

  describe('sendHtml', () => {
    it('sends HTML with correct content type', () => {
      let res = createMockResponse();
      let html = '<!DOCTYPE html><html><body>Hello</body></html>';

      sendHtml(res, 200, html);

      assert.strictEqual(res.getHeader('Content-Type'), 'text/html');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, html);
    });

    it('sends HTML with custom status code', () => {
      let res = createMockResponse();

      sendHtml(res, 500, '<html><body>Error</body></html>');

      assert.strictEqual(res.statusCode, 500);
    });
  });

  describe('sendFile', () => {
    it('sends file with content type', () => {
      let res = createMockResponse();
      let content = Buffer.from('file content');

      sendFile(res, content, 'text/plain');

      assert.strictEqual(res.getHeader('Content-Type'), 'text/plain');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, content);
    });

    it('sends binary file', () => {
      let res = createMockResponse();
      let content = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

      sendFile(res, content, 'image/png');

      assert.strictEqual(res.getHeader('Content-Type'), 'image/png');
      assert.deepStrictEqual(res.body, content);
    });

    it('sends string content', () => {
      let res = createMockResponse();

      sendFile(res, 'string content', 'text/plain');

      assert.strictEqual(res.body, 'string content');
    });
  });
});
