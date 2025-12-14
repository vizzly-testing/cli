import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createConfigRouter } from '../../../src/server/routers/config.js';

/**
 * Creates a mock HTTP request with body support
 */
function createMockRequest(method = 'GET', body = null) {
  let emitter = new EventEmitter();
  emitter.method = method;

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
 * Creates a mock config service
 */
function createMockConfigService(results = {}) {
  return {
    getConfig: async scope => {
      if (results.getConfigError) {
        throw results.getConfigError;
      }
      return results.config || { threshold: 0.1 };
    },
    updateConfig: async (scope, data) => {
      if (results.updateConfigError) {
        throw results.updateConfigError;
      }
      return results.updateResult || { updated: true };
    },
    validateConfig: async data => {
      if (results.validateError) {
        throw results.validateError;
      }
      return results.validateResult || { valid: true };
    },
  };
}

describe('server/routers/config', () => {
  describe('createConfigRouter', () => {
    it('returns false for non-config paths', async () => {
      let handler = createConfigRouter({
        configService: createMockConfigService(),
      });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/other');

      assert.strictEqual(result, false);
    });

    it('returns 503 when configService is unavailable', async () => {
      let handler = createConfigRouter({ configService: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/api/config');

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 503);
      let body = res.getParsedBody();
      assert.ok(body.error.includes('not available'));
    });

    describe('GET /api/config', () => {
      it('returns merged config', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({ config: { threshold: 0.5 } }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/config');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.threshold, 0.5);
      });

      it('returns 500 on error', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            getConfigError: new Error('Config load failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/config');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Config load failed'));
      });
    });

    describe('GET /api/config/project', () => {
      it('returns project config', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({ config: { port: 3000 } }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/config/project');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.port, 3000);
      });

      it('returns 500 on error', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            getConfigError: new Error('Project config failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/config/project');

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('GET /api/config/global', () => {
      it('returns global config', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({ config: { port: 4000 } }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/config/global');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.port, 4000);
      });

      it('returns 500 on error', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            getConfigError: new Error('Global config failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/config/global');

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('POST /api/config/project', () => {
      it('updates project config', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({ updateResult: { saved: true } }),
        });
        let req = createMockRequest('POST', { threshold: 0.2 });
        let res = createMockResponse();

        await handler(req, res, '/api/config/project');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.saved, true);
      });

      it('returns 500 on error', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            updateConfigError: new Error('Update failed'),
          }),
        });
        let req = createMockRequest('POST', { threshold: 0.2 });
        let res = createMockResponse();

        await handler(req, res, '/api/config/project');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Update failed'));
      });
    });

    describe('POST /api/config/global', () => {
      it('updates global config', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({ updateResult: { saved: true } }),
        });
        let req = createMockRequest('POST', { threshold: 0.3 });
        let res = createMockResponse();

        await handler(req, res, '/api/config/global');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
      });

      it('returns 500 on error', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            updateConfigError: new Error('Global update failed'),
          }),
        });
        let req = createMockRequest('POST', { threshold: 0.3 });
        let res = createMockResponse();

        await handler(req, res, '/api/config/global');

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('POST /api/config/validate', () => {
      it('validates config', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            validateResult: { valid: true, errors: [] },
          }),
        });
        let req = createMockRequest('POST', { threshold: 0.1 });
        let res = createMockResponse();

        await handler(req, res, '/api/config/validate');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.valid, true);
      });

      it('returns 500 on validation error', async () => {
        let handler = createConfigRouter({
          configService: createMockConfigService({
            validateError: new Error('Validation failed'),
          }),
        });
        let req = createMockRequest('POST', { threshold: 'invalid' });
        let res = createMockResponse();

        await handler(req, res, '/api/config/validate');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Validation failed'));
      });
    });
  });
});
