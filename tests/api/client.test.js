import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { createApiClient, DEFAULT_API_URL } from '../../src/api/client.js';
import {
  getAuthTokens,
  saveAuthTokens,
} from '../../src/utils/global-config.js';

describe('api/client', () => {
  describe('DEFAULT_API_URL', () => {
    it('is the production Vizzly URL', () => {
      assert.strictEqual(DEFAULT_API_URL, 'https://app.vizzly.dev');
    });
  });

  describe('createApiClient', () => {
    it('creates client with token', () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      assert.ok(client.request);
      assert.ok(client.getBaseUrl);
      assert.ok(client.getToken);
      assert.ok(client.getUserAgent);
    });

    it('creates client with allowNoToken option', () => {
      let client = createApiClient({
        allowNoToken: true,
        baseUrl: 'https://api.test',
      });

      assert.ok(client.request);
      assert.strictEqual(client.getToken(), null);
    });

    it('uses apiKey as fallback for token', () => {
      let client = createApiClient({
        apiKey: 'my-api-key',
        baseUrl: 'https://api.test',
      });

      assert.strictEqual(client.getToken(), 'my-api-key');
    });

    it('uses apiUrl as fallback for baseUrl', () => {
      let client = createApiClient({
        apiUrl: 'https://custom-api.test',
        token: 'test-token',
      });

      assert.strictEqual(client.getBaseUrl(), 'https://custom-api.test');
    });

    it('throws when no token and allowNoToken is false', () => {
      assert.throws(
        () => createApiClient({ baseUrl: 'https://api.test' }),
        /No API token provided/
      );
    });

    it('uses default API URL when not specified', () => {
      let client = createApiClient({
        token: 'test-token',
      });

      assert.strictEqual(client.getBaseUrl(), DEFAULT_API_URL);
    });

    it('includes command in user agent', () => {
      let client = createApiClient({
        token: 'test-token',
        command: 'upload',
      });

      let userAgent = client.getUserAgent();

      assert.ok(userAgent.includes('upload'));
    });

    it('includes SDK user agent when provided', () => {
      let client = createApiClient({
        token: 'test-token',
        sdkUserAgent: 'playwright/1.40.0',
      });

      let userAgent = client.getUserAgent();

      assert.ok(userAgent.includes('playwright/1.40.0'));
    });

    it('uses userAgent as fallback for sdkUserAgent', () => {
      let client = createApiClient({
        token: 'test-token',
        userAgent: 'custom-agent/1.0.0',
      });

      let userAgent = client.getUserAgent();

      assert.ok(userAgent.includes('custom-agent/1.0.0'));
    });

    it('defaults command to api', () => {
      let client = createApiClient({
        token: 'test-token',
      });

      let userAgent = client.getUserAgent();

      assert.ok(userAgent.includes('(api)'));
    });
  });

  describe('request', () => {
    let originalFetch;
    let mockFetch;
    let originalVizzlyHome;
    let tempHome;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalVizzlyHome = process.env.VIZZLY_HOME;
      tempHome = mkdtempSync(join(tmpdir(), 'vizzly-api-client-test-'));
      process.env.VIZZLY_HOME = tempHome;
      mockFetch = mock.fn();
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalVizzlyHome) {
        process.env.VIZZLY_HOME = originalVizzlyHome;
      } else {
        delete process.env.VIZZLY_HOME;
      }
      rmSync(tempHome, { recursive: true, force: true });
    });

    it('makes request to correct URL', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ data: 'result' }),
      }));

      let result = await client.request('/api/builds');

      assert.deepStrictEqual(result, { data: 'result' });
      assert.strictEqual(mockFetch.mock.calls.length, 1);

      let [url, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(url, 'https://api.test/api/builds');
      assert.ok(options.headers.Authorization.includes('test-token'));
    });

    it('passes through fetch options', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: true,
        json: async () => ({}),
      }));

      await client.request('/api/builds', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      });

      let [, options] = mockFetch.mock.calls[0].arguments;
      assert.strictEqual(options.method, 'POST');
      assert.strictEqual(options.headers['Content-Type'], 'application/json');
    });

    it('throws AuthError for 401 response', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 401,
        headers: new Map(),
        text: async () => 'Unauthorized',
      }));

      await assert.rejects(
        () => client.request('/api/protected'),
        error => {
          assert.strictEqual(error.name, 'AuthError');
          return true;
        }
      );
    });

    it('does not exchange user refresh tokens for failed project-token requests', async () => {
      await saveAuthTokens({
        accessToken: 'user-access-token',
        refreshToken: 'user-refresh-token',
        expiresAt: '2999-01-01T00:00:00.000Z',
      });

      let client = createApiClient({
        token: 'vzt_project_token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 401,
        headers: new Map(),
        text: async () => 'Unauthorized',
      }));

      await assert.rejects(() => client.request('/api/sdk/builds'), {
        name: 'AuthError',
      });
      assert.strictEqual(mockFetch.mock.calls.length, 1);
    });

    it('does not refresh or rewrite user auth through a different API origin', async () => {
      await saveAuthTokens({
        accessToken: 'user-access-token',
        refreshToken: 'user-refresh-token',
        expiresAt: '2000-01-01T00:00:00.000Z',
        apiUrl: 'https://app.vizzly.dev',
      });

      let client = createApiClient({
        token: 'user-access-token',
        baseUrl: 'http://localhost:3000',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 401,
        headers: new Map(),
        text: async () => 'Unauthorized',
      }));

      await assert.rejects(() => client.request('/api/protected'), {
        name: 'AuthError',
      });
      assert.strictEqual(mockFetch.mock.calls.length, 1);
      assert.deepStrictEqual(await getAuthTokens(), {
        accessToken: 'user-access-token',
        refreshToken: 'user-refresh-token',
        expiresAt: '2000-01-01T00:00:00.000Z',
        apiUrl: 'https://app.vizzly.dev',
      });
    });

    it('preserves the authenticated API URL when refreshing a user token', async () => {
      await saveAuthTokens({
        accessToken: 'old-access-token',
        refreshToken: 'user-refresh-token',
        expiresAt: '2000-01-01T00:00:00.000Z',
        apiUrl: 'http://localhost:3000',
      });

      let client = createApiClient({
        token: 'old-access-token',
        baseUrl: 'http://localhost:3000',
      });
      let callCount = 0;
      mockFetch.mock.mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: false,
            status: 401,
            headers: new Map(),
            text: async () => 'Expired',
          };
        }
        if (callCount === 2) {
          return {
            ok: true,
            json: async () => ({
              accessToken: 'new-access-token',
              refreshToken: 'new-refresh-token',
              expiresIn: 3600,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ data: 'refreshed' }),
        };
      });

      let result = await client.request('/api/builds');
      let stored = await getAuthTokens();

      assert.deepStrictEqual(result, { data: 'refreshed' });
      assert.strictEqual(stored.apiUrl, 'http://localhost:3000');
      assert.strictEqual(mockFetch.mock.calls.length, 3);
    });

    it('throws VizzlyError for server errors', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 500,
        headers: new Map(),
        text: async () => 'Internal Server Error',
      }));

      await assert.rejects(
        () => client.request('/api/test'),
        error => {
          assert.strictEqual(error.name, 'VizzlyError');
          return true;
        }
      );
    });

    it('includes status code in error context for 5xx errors', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 503,
        headers: new Map(),
        text: async () => 'Service Unavailable',
      }));

      await assert.rejects(
        () => client.request('/api/test'),
        error => {
          assert.strictEqual(error.context?.status, 503);
          return true;
        }
      );
    });

    it('includes status code in error context for 4xx errors', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 404,
        headers: new Map(),
        text: async () => 'Not Found',
      }));

      await assert.rejects(
        () => client.request('/api/test'),
        error => {
          assert.strictEqual(error.context?.status, 404);
          return true;
        }
      );
    });

    it('throws VizzlyError for 403 forbidden', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 403,
        headers: new Map(),
        text: async () => 'Forbidden',
      }));

      await assert.rejects(
        () => client.request('/api/admin'),
        error => {
          assert.strictEqual(error.name, 'VizzlyError');
          return true;
        }
      );
    });

    it('throws VizzlyError for 404 not found', async () => {
      let client = createApiClient({
        token: 'test-token',
        baseUrl: 'https://api.test',
      });

      mockFetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 404,
        headers: new Map(),
        text: async () => 'Not Found',
      }));

      await assert.rejects(
        () => client.request('/api/missing'),
        error => {
          assert.strictEqual(error.name, 'VizzlyError');
          return true;
        }
      );
    });
  });
});
