import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { createAuthClient } from '../../src/auth/client.js';

/**
 * Create a mock Headers object matching the fetch API spec
 * @param {Object} headers - Header key-value pairs
 * @returns {Object} Mock headers with get() method
 */
function createMockHeaders(headers = {}) {
  return {
    get: key => headers[key.toLowerCase()] || null,
  };
}

describe('auth/client', () => {
  let originalFetch;
  let mockFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('createAuthClient', () => {
    it('creates client with default user agent', () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      assert.ok(client.request);
      assert.ok(client.authenticatedRequest);
      assert.ok(client.getBaseUrl);
      assert.ok(client.getUserAgent);
    });

    it('returns configured base URL', () => {
      let client = createAuthClient({ baseUrl: 'https://custom.api' });

      assert.strictEqual(client.getBaseUrl(), 'https://custom.api');
    });

    it('uses custom user agent when provided', () => {
      let client = createAuthClient({
        baseUrl: 'https://api.test',
        userAgent: 'custom-agent/1.0',
      });

      assert.strictEqual(client.getUserAgent(), 'custom-agent/1.0');
    });

    it('builds default user agent with auth command', () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      let userAgent = client.getUserAgent();
      assert.ok(userAgent.includes('vizzly-cli'));
      assert.ok(userAgent.includes('auth'));
    });
  });

  describe('request', () => {
    it('makes unauthenticated request to endpoint', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      }));

      let result = await client.request('/api/device/code');

      assert.deepStrictEqual(result, { success: true });
      assert.strictEqual(mockFetch.mock.calls.length, 1);

      let [url, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(url, 'https://api.test/api/device/code');
      assert.ok(options.headers['User-Agent']);
    });

    it('passes through fetch options', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({}),
      }));

      await client.request('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
        headers: { 'Content-Type': 'application/json' },
      });

      let [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['Content-Type'], 'application/json');
    });

    it('throws AuthError for 401 response', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 401,
        headers: createMockHeaders({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Invalid credentials' }),
      }));

      await assert.rejects(
        () => client.request('/api/login'),
        error => {
          assert.strictEqual(error.name, 'AuthError');
          assert.strictEqual(error.message, 'Invalid credentials');
          return true;
        }
      );
    });

    it('throws VizzlyError for 429 rate limit', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 429,
        headers: createMockHeaders({ 'content-type': 'application/json' }),
        json: async () => ({}),
      }));

      await assert.rejects(
        () => client.request('/api/login'),
        error => {
          assert.strictEqual(error.code, 'RATE_LIMIT_ERROR');
          assert.ok(error.message.includes('Too many login attempts'));
          return true;
        }
      );
    });

    it('throws VizzlyError for server errors', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: createMockHeaders({ 'content-type': 'text/plain' }),
        text: async () => 'Server error',
      }));

      await assert.rejects(
        () => client.request('/api/test'),
        error => {
          assert.strictEqual(error.code, 'AUTH_REQUEST_ERROR');
          assert.ok(error.message.includes('500'));
          return true;
        }
      );
    });

    it('handles response body parse errors', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: () => 'application/json',
        },
        json: async () => {
          throw new Error('Parse error');
        },
      }));

      await assert.rejects(
        () => client.request('/api/test'),
        error => {
          assert.strictEqual(error.code, 'AUTH_REQUEST_ERROR');
          return true;
        }
      );
    });
  });

  describe('authenticatedRequest', () => {
    it('makes authenticated request with bearer token', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ user: { id: 'user_123' } }),
      }));

      let result = await client.authenticatedRequest(
        '/api/auth/cli/whoami',
        'access_token_123'
      );

      assert.deepStrictEqual(result, { user: { id: 'user_123' } });

      let [url, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(url, 'https://api.test/api/auth/cli/whoami');
      assert.strictEqual(
        options.headers.Authorization,
        'Bearer access_token_123'
      );
    });

    it('passes through fetch options for authenticated requests', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({}),
      }));

      await client.authenticatedRequest('/api/update', 'token', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
      });

      let [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.method, 'PUT');
      assert.strictEqual(options.headers['Content-Type'], 'application/json');
      assert.strictEqual(options.headers.Authorization, 'Bearer token');
    });

    it('throws AuthError for 401 expired token', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 401,
        headers: createMockHeaders({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Token expired' }),
      }));

      await assert.rejects(
        () => client.authenticatedRequest('/api/protected', 'expired_token'),
        error => {
          assert.strictEqual(error.name, 'AuthError');
          assert.ok(error.message.includes('invalid or expired'));
          return true;
        }
      );
    });

    it('throws VizzlyError for other errors', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 403,
        headers: createMockHeaders({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Forbidden' }),
      }));

      await assert.rejects(
        () => client.authenticatedRequest('/api/admin', 'token'),
        error => {
          assert.strictEqual(error.code, 'API_REQUEST_ERROR');
          assert.ok(error.message.includes('403'));
          return true;
        }
      );
    });

    it('handles text response body on error', async () => {
      let client = createAuthClient({ baseUrl: 'https://api.test' });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: () => 'text/plain',
        },
        text: async () => 'Plain text error',
      }));

      await assert.rejects(
        () => client.authenticatedRequest('/api/test', 'token'),
        error => {
          assert.ok(error.message.includes('500'));
          return true;
        }
      );
    });
  });
});
