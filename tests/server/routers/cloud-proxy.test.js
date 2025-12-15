import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createCloudProxyRouter } from '../../../src/server/routers/cloud-proxy.js';

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
 * Creates a mock URL object
 */
function createMockUrl(params = {}) {
  return {
    searchParams: {
      get: key => params[key] || null,
    },
  };
}

/**
 * Creates a mock auth service
 */
function createMockAuthService(options = {}) {
  return {
    authenticatedRequest: async (_endpoint, _fetchOptions) => {
      if (options.requestError) throw options.requestError;
      return options.response || { success: true };
    },
  };
}

describe('server/routers/cloud-proxy', () => {
  describe('createCloudProxyRouter', () => {
    it('returns false for non-cloud paths', async () => {
      let handler = createCloudProxyRouter({
        authService: createMockAuthService(),
      });
      let req = createMockRequest('GET');
      let res = createMockResponse();
      let url = createMockUrl();

      let result = await handler(req, res, '/other', url);

      assert.strictEqual(result, false);
    });

    it('returns 503 when authService is unavailable', async () => {
      let handler = createCloudProxyRouter({ authService: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();
      let url = createMockUrl();

      let result = await handler(req, res, '/api/cloud/projects', url);

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 503);
    });

    describe('GET /api/cloud/projects', () => {
      it('returns projects from cloud', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({
            response: {
              projects: [{ slug: 'proj-1' }, { slug: 'proj-2' }],
            },
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/projects', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.projects.length, 2);
      });

      it('returns empty array when not authenticated', async () => {
        let error = new Error('not authenticated');
        error.code = 'AUTH_ERROR';
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({ requestError: error }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/projects', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.deepStrictEqual(body.projects, []);
        assert.strictEqual(body.authenticated, false);
      });

      it('returns 500 on other errors', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({
            requestError: new Error('Network error'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/projects', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('GET /api/cloud/organizations/:org/projects/:project/builds', () => {
      it('returns builds for organization/project', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({
            response: {
              builds: [{ id: 'build-1' }, { id: 'build-2' }],
            },
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl({ limit: '10', branch: 'main' });

        await handler(
          req,
          res,
          '/api/cloud/organizations/my-org/projects/my-project/builds',
          url
        );

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.builds.length, 2);
      });

      it('handles URL-encoded slugs', async () => {
        let capturedEndpoint;
        let handler = createCloudProxyRouter({
          authService: {
            authenticatedRequest: async endpoint => {
              capturedEndpoint = endpoint;
              return { builds: [] };
            },
          },
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(
          req,
          res,
          '/api/cloud/organizations/my%20org/projects/my%20project/builds',
          url
        );

        assert.ok(capturedEndpoint.includes('my org'));
        assert.ok(capturedEndpoint.includes('my project'));
      });

      it('returns 500 on error', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({
            requestError: new Error('API error'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(
          req,
          res,
          '/api/cloud/organizations/org/projects/proj/builds',
          url
        );

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('POST /api/cloud/baselines/download', () => {
      it('downloads baselines from build', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({
            response: { downloaded: 5 },
          }),
        });
        let req = createMockRequest('POST', { buildId: 'build-123' });
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/baselines/download', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.ok(body.message.includes('build-123'));
      });

      it('returns 400 when buildId is missing', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService(),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/baselines/download', url);

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('buildId'));
      });

      it('returns 500 on error', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService({
            requestError: new Error('Download failed'),
          }),
        });
        let req = createMockRequest('POST', { buildId: 'build-123' });
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/baselines/download', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('Unknown cloud routes', () => {
      it('returns 404 for unknown cloud routes', async () => {
        let handler = createCloudProxyRouter({
          authService: createMockAuthService(),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/cloud/unknown', url);

        assert.strictEqual(res.statusCode, 404);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not found'));
      });
    });
  });
});
