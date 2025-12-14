import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createAuthRouter } from '../../../src/server/routers/auth.js';

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
 * Creates a mock auth service
 */
function createMockAuthService(options = {}) {
  return {
    isAuthenticated: async () => {
      if (options.authError) throw options.authError;
      return options.authenticated ?? false;
    },
    whoami: async () => {
      if (options.whoamiError) throw options.whoamiError;
      return { user: options.user || { email: 'test@example.com' } };
    },
    initiateDeviceFlow: async () => {
      if (options.initiateError) throw options.initiateError;
      return (
        options.deviceFlow || {
          device_code: 'device-123',
          user_code: 'ABCD-1234',
          verification_uri: 'https://auth.example.com/device',
          verification_uri_complete:
            'https://auth.example.com/device?code=ABCD-1234',
          expires_in: 600,
          interval: 5,
        }
      );
    },
    pollDeviceAuthorization: async deviceCode => {
      if (options.pollError) throw options.pollError;
      return options.pollResult || { status: 'pending' };
    },
    completeDeviceFlow: async tokens => {
      if (options.completeError) throw options.completeError;
    },
    logout: async () => {
      if (options.logoutError) throw options.logoutError;
    },
  };
}

describe('server/routers/auth', () => {
  describe('createAuthRouter', () => {
    it('returns false for unmatched paths', async () => {
      let handler = createAuthRouter({
        authService: createMockAuthService(),
      });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/other');

      assert.strictEqual(result, false);
    });

    it('returns 503 when authService is unavailable', async () => {
      let handler = createAuthRouter({ authService: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();

      let result = await handler(req, res, '/api/auth/status');

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 503);
    });

    describe('GET /api/auth/status', () => {
      it('returns authenticated status with user', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            authenticated: true,
            user: { email: 'user@example.com', name: 'Test User' },
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/auth/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.authenticated, true);
        assert.strictEqual(body.user.email, 'user@example.com');
      });

      it('returns unauthenticated status', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({ authenticated: false }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/auth/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.authenticated, false);
        assert.strictEqual(body.user, null);
      });

      it('handles errors gracefully', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            authError: new Error('Auth check failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();

        await handler(req, res, '/api/auth/status');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.authenticated, false);
      });
    });

    describe('POST /api/auth/login', () => {
      it('initiates device flow', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService(),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/auth/login');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.deviceCode, 'device-123');
        assert.strictEqual(body.userCode, 'ABCD-1234');
        assert.strictEqual(
          body.verificationUri,
          'https://auth.example.com/device'
        );
        assert.strictEqual(body.expiresIn, 600);
      });

      it('returns 500 on error', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            initiateError: new Error('Failed to initiate'),
          }),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/auth/login');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Failed to initiate'));
      });
    });

    describe('POST /api/auth/poll', () => {
      it('returns pending status', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            pollResult: {},
          }),
        });
        let req = createMockRequest('POST', { deviceCode: 'device-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/auth/poll');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.status, 'pending');
      });

      it('returns 400 when deviceCode is missing', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService(),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/auth/poll');

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('deviceCode'));
      });

      it('handles authorization pending error', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            pollError: new Error('Authorization pending'),
          }),
        });
        let req = createMockRequest('POST', { deviceCode: 'device-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/auth/poll');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.status, 'pending');
      });

      it('completes authorization with tokens', async () => {
        let completedTokens = null;
        let handler = createAuthRouter({
          authService: {
            ...createMockAuthService(),
            pollDeviceAuthorization: async () => ({
              tokens: {
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                expiresIn: 3600,
              },
              user: { email: 'user@example.com' },
            }),
            completeDeviceFlow: async tokens => {
              completedTokens = tokens;
            },
          },
        });
        let req = createMockRequest('POST', { deviceCode: 'device-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/auth/poll');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.status, 'complete');
        assert.strictEqual(body.user.email, 'user@example.com');
        assert.strictEqual(completedTokens.accessToken, 'access-token');
      });

      it('returns 500 on other errors', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            pollError: new Error('Network error'),
          }),
        });
        let req = createMockRequest('POST', { deviceCode: 'device-123' });
        let res = createMockResponse();

        await handler(req, res, '/api/auth/poll');

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('logs out user', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService(),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/auth/logout');

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.ok(body.message.includes('Logged out'));
      });

      it('returns 500 on error', async () => {
        let handler = createAuthRouter({
          authService: createMockAuthService({
            logoutError: new Error('Logout failed'),
          }),
        });
        let req = createMockRequest('POST', {});
        let res = createMockResponse();

        await handler(req, res, '/api/auth/logout');

        assert.strictEqual(res.statusCode, 500);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('Logout failed'));
      });
    });
  });
});
