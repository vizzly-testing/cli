import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { parseJsonBody } from '../../../src/server/middleware/json-parser.js';

/**
 * Creates a mock HTTP request using EventEmitter
 */
function createMockRequest(method = 'GET') {
  let emitter = new EventEmitter();
  emitter.method = method;
  return emitter;
}

describe('server/middleware/json-parser', () => {
  describe('parseJsonBody', () => {
    it('returns null for GET requests', async () => {
      let req = createMockRequest('GET');

      let result = await parseJsonBody(req);

      assert.strictEqual(result, null);
    });

    it('returns null for DELETE requests', async () => {
      let req = createMockRequest('DELETE');

      let result = await parseJsonBody(req);

      assert.strictEqual(result, null);
    });

    it('parses JSON body for POST requests', async () => {
      let req = createMockRequest('POST');

      let promise = parseJsonBody(req);

      // Simulate data chunks
      req.emit('data', '{"name":');
      req.emit('data', '"test"}');
      req.emit('end');

      let result = await promise;

      assert.deepStrictEqual(result, { name: 'test' });
    });

    it('parses JSON body for PUT requests', async () => {
      let req = createMockRequest('PUT');

      let promise = parseJsonBody(req);

      req.emit('data', '{"updated": true}');
      req.emit('end');

      let result = await promise;

      assert.deepStrictEqual(result, { updated: true });
    });

    it('parses JSON body for PATCH requests', async () => {
      let req = createMockRequest('PATCH');

      let promise = parseJsonBody(req);

      req.emit('data', '{"field": "value"}');
      req.emit('end');

      let result = await promise;

      assert.deepStrictEqual(result, { field: 'value' });
    });

    it('returns empty object for empty body', async () => {
      let req = createMockRequest('POST');

      let promise = parseJsonBody(req);

      req.emit('end');

      let result = await promise;

      assert.deepStrictEqual(result, {});
    });

    it('rejects for invalid JSON', async () => {
      let req = createMockRequest('POST');

      let promise = parseJsonBody(req);

      req.emit('data', 'not valid json');
      req.emit('end');

      await assert.rejects(promise, /Invalid JSON/);
    });

    it('rejects on request error', async () => {
      let req = createMockRequest('POST');

      let promise = parseJsonBody(req);

      req.emit('error', new Error('Connection reset'));

      await assert.rejects(promise, /Connection reset/);
    });

    it('handles buffer chunks', async () => {
      let req = createMockRequest('POST');

      let promise = parseJsonBody(req);

      req.emit('data', Buffer.from('{"buffer":'));
      req.emit('data', Buffer.from('"test"}'));
      req.emit('end');

      let result = await promise;

      assert.deepStrictEqual(result, { buffer: 'test' });
    });
  });
});
