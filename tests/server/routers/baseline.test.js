import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createBaselineRouter } from '../../../src/server/routers/baseline.js';

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
 * Creates a mock screenshot handler
 */
function createMockScreenshotHandler(options = {}) {
  return {
    acceptBaseline: options.acceptBaseline
      ? async id => {
          if (options.acceptError) throw options.acceptError;
          return { id };
        }
      : undefined,
    acceptAllBaselines: options.acceptAllBaselines
      ? async () => {
          if (options.acceptAllError) throw options.acceptAllError;
          return { count: options.acceptAllCount || 5 };
        }
      : undefined,
    resetBaselines: options.resetBaselines
      ? async () => {
          if (options.resetError) throw options.resetError;
        }
      : undefined,
    deleteComparison: options.deleteComparison
      ? async id => {
          if (options.deleteError) throw options.deleteError;
          return { success: true, id };
        }
      : undefined,
  };
}

/**
 * Creates a mock TDD service
 */
function createMockTddService(options = {}) {
  return {
    downloadBaselines: async (_env, _branch, _buildId) => {
      if (options.downloadError) throw options.downloadError;
      return { downloaded: options.downloadCount || 10 };
    },
    processDownloadedBaselines: async (_apiResponse, _buildId) => {
      if (options.processError) throw options.processError;
      return { downloaded: options.downloadCount || 10 };
    },
  };
}

/**
 * Creates a mock auth service
 */
function _createMockAuthService(options = {}) {
  return {
    authenticatedRequest: async (_path, _options) => {
      if (options.authError) throw options.authError;
      return (
        options.response || {
          build: { id: 'build-123', status: 'completed' },
          screenshots: [],
          signatureProperties: [],
        }
      );
    },
  };
}

describe('server/routers/baseline', () => {
  describe('createBaselineRouter', () => {
    it('returns false for unmatched paths', async () => {
      let handler = createBaselineRouter({
        screenshotHandler: createMockScreenshotHandler(),
        tddService: null,
      });
      let req = createMockRequest('POST');
      let res = createMockResponse();

      let result = await handler(req, res, '/other');

      assert.strictEqual(result, false);
    });

    describe('POST /api/baseline/accept', () => {
      it('accepts baseline with ID', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptBaseline: true,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.ok(body.message.includes('comparison-123'));
      });

      it('returns 400 when acceptBaseline not available', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: {},
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not available'));
      });

      it('returns 400 when ID is missing', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptBaseline: true,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('ID'));
      });

      it('returns 500 on error', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptBaseline: true,
            acceptError: new Error('Accept failed'),
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Accept failed'));
      });
    });

    describe('POST /api/baseline/accept-all', () => {
      it('accepts all baselines', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptAllBaselines: true,
            acceptAllCount: 10,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept-all');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.count, 10);
        assert.ok(body.message.includes('10'));
      });

      it('returns 400 when acceptAllBaselines not available', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: {},
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept-all');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not available'));
      });

      it('returns 500 on error', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            acceptAllBaselines: true,
            acceptAllError: new Error('Accept all failed'),
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/accept-all');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Accept all failed'));
      });
    });

    describe('POST /api/baseline/reset', () => {
      it('resets baselines', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            resetBaselines: true,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/reset');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.ok(body.message.includes('reset'));
      });

      it('returns 400 when resetBaselines not available', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: {},
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/reset');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not available'));
      });

      it('returns 500 on error', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            resetBaselines: true,
            resetError: new Error('Reset failed'),
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/reset');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Reset failed'));
      });
    });

    describe('POST /api/baseline/delete', () => {
      it('deletes comparison with ID', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            deleteComparison: true,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/delete');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.ok(body.message.includes('comparison-123'));
      });

      it('returns 400 when deleteComparison not available', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: {},
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/delete');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not available'));
      });

      it('returns 400 when ID is missing', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            deleteComparison: true,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/delete');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('ID'));
      });

      it('returns 404 when comparison not found', async () => {
        let notFoundError = new Error('Comparison not found with ID: xyz');
        notFoundError.code = 'NOT_FOUND';
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            deleteComparison: true,
            deleteError: notFoundError,
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'xyz' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/delete');

        assert.strictEqual(res.statusCode, 404);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not found'));
      });

      it('returns 500 on other errors', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler({
            deleteComparison: true,
            deleteError: new Error('Delete failed'),
          }),
          tddService: null,
        });
        let req = createMockRequest('POST', { id: 'comparison-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baseline/delete');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Delete failed'));
      });
    });

    describe('POST /api/baselines/download', () => {
      it('downloads baselines from build', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: createMockTddService({ downloadCount: 15 }),
        });
        let req = createMockRequest('POST', { buildId: 'build-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.downloaded, 15);
        assert.ok(body.message.includes('build-123'));
      });

      it('returns 503 when tddService not available', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: null,
        });
        let req = createMockRequest('POST', { buildId: 'build-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 503);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('not available'));
      });

      it('returns 400 when buildId is missing', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: createMockTddService(),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('buildId'));
      });

      it('returns 500 on download error', async () => {
        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: createMockTddService({
            downloadError: new Error('Download failed'),
          }),
        });
        let req = createMockRequest('POST', { buildId: 'build-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Download failed'));
      });

      it('uses OAuth when organizationSlug and projectSlug provided', async () => {
        let authRequestPath = null;
        let authRequestHeaders = null;
        let mockAuthService = {
          authenticatedRequest: async (path, options) => {
            authRequestPath = path;
            authRequestHeaders = options.headers;
            return {
              build: { id: 'build-456', status: 'completed' },
              screenshots: [],
              signatureProperties: [],
            };
          },
        };

        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: createMockTddService(),
          authService: mockAuthService,
        });
        let req = createMockRequest('POST', {
          buildId: 'build-456',
          organizationSlug: 'my-org',
          projectSlug: 'my-project',
        });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(
          authRequestPath.includes('/api/cli/my-project/builds/build-456'),
          `Expected OAuth path, got: ${authRequestPath}`
        );
        assert.strictEqual(authRequestHeaders['X-Organization'], 'my-org');
      });

      it('falls back to tddService when OAuth fails with auth error', async () => {
        let tddServiceCalled = false;
        let mockAuthService = {
          authenticatedRequest: async () => {
            throw new Error('Not authenticated');
          },
        };
        let mockTddService = {
          downloadBaselines: async () => {
            tddServiceCalled = true;
            return { downloaded: 5 };
          },
          processDownloadedBaselines: async () => {
            return { downloaded: 5 };
          },
        };

        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: mockTddService,
          authService: mockAuthService,
        });
        let req = createMockRequest('POST', {
          buildId: 'build-789',
          organizationSlug: 'my-org',
          projectSlug: 'my-project',
        });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(tddServiceCalled, 'Should fall back to tddService');
      });

      it('throws non-auth OAuth errors without fallback', async () => {
        let mockAuthService = {
          authenticatedRequest: async () => {
            throw new Error('Build not found');
          },
        };
        let tddServiceCalled = false;
        let mockTddService = {
          downloadBaselines: async () => {
            tddServiceCalled = true;
            return { downloaded: 5 };
          },
          processDownloadedBaselines: async () => {
            return { downloaded: 5 };
          },
        };

        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: mockTddService,
          authService: mockAuthService,
        });
        let req = createMockRequest('POST', {
          buildId: 'build-999',
          organizationSlug: 'my-org',
          projectSlug: 'my-project',
        });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 500);
        assert.ok(
          !tddServiceCalled,
          'Should NOT fall back for non-auth errors'
        );
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Build not found'));
      });

      it('skips OAuth when organizationSlug or projectSlug missing', async () => {
        let authServiceCalled = false;
        let tddServiceCalled = false;
        let mockAuthService = {
          authenticatedRequest: async () => {
            authServiceCalled = true;
            return { build: {}, screenshots: [] };
          },
        };
        let mockTddService = {
          downloadBaselines: async () => {
            tddServiceCalled = true;
            return { downloaded: 5 };
          },
          processDownloadedBaselines: async () => {
            return { downloaded: 5 };
          },
        };

        let handler = createBaselineRouter({
          screenshotHandler: createMockScreenshotHandler(),
          tddService: mockTddService,
          authService: mockAuthService,
        });
        // Missing organizationSlug and projectSlug
        let req = createMockRequest('POST', { buildId: 'build-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/baselines/download');

        assert.strictEqual(res.statusCode, 200);
        assert.ok(!authServiceCalled, 'Should NOT use OAuth without slugs');
        assert.ok(tddServiceCalled, 'Should use tddService directly');
      });
    });
  });
});
