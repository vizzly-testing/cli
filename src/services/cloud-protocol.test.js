import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildApiUrl,
  buildAuthHeader,
  buildEndpointWithParams,
  buildQueryParams,
  buildRequestHeaders,
  buildUserAgent,
  extractErrorBody,
  isAuthError,
  isRateLimited,
  parseApiError,
  shouldRetryWithRefresh,
} from './cloud-protocol.js';

describe('buildAuthHeader', () => {
  it('returns Bearer token header when token provided', () => {
    let result = buildAuthHeader('abc123');

    assert.deepStrictEqual(result, { Authorization: 'Bearer abc123' });
  });

  it('returns empty object for null token', () => {
    let result = buildAuthHeader(null);

    assert.deepStrictEqual(result, {});
  });

  it('returns empty object for undefined token', () => {
    let result = buildAuthHeader(undefined);

    assert.deepStrictEqual(result, {});
  });
});

describe('buildUserAgent', () => {
  it('builds user agent with version and command', () => {
    let result = buildUserAgent('1.2.3', 'upload', null, '22.13.1');

    assert.strictEqual(result, 'vizzly-cli/1.2.3 (upload) node/22.13.1');
  });

  it('appends SDK user agent when provided', () => {
    let result = buildUserAgent('1.2.3', 'run', 'playwright/1.40.0', '22.13.1');

    assert.strictEqual(
      result,
      'vizzly-cli/1.2.3 (run) playwright/1.40.0 node/22.13.1'
    );
  });

  it('ignores null SDK user agent', () => {
    let result = buildUserAgent('1.2.3', 'tdd', null, '22.13.1');

    assert.strictEqual(result, 'vizzly-cli/1.2.3 (tdd) node/22.13.1');
  });
});

describe('buildRequestHeaders', () => {
  it('builds headers with token and user agent', () => {
    let result = buildRequestHeaders({
      token: 'my-token',
      userAgent: 'vizzly-cli/1.0.0 (test)',
    });

    assert.deepStrictEqual(result, {
      'User-Agent': 'vizzly-cli/1.0.0 (test)',
      Authorization: 'Bearer my-token',
    });
  });

  it('includes content-type when provided', () => {
    let result = buildRequestHeaders({
      token: 'my-token',
      userAgent: 'vizzly-cli/1.0.0 (test)',
      contentType: 'application/json',
    });

    assert.strictEqual(result['Content-Type'], 'application/json');
  });

  it('omits auth header when no token', () => {
    let result = buildRequestHeaders({
      token: null,
      userAgent: 'vizzly-cli/1.0.0 (test)',
    });

    assert.strictEqual(result.Authorization, undefined);
    assert.strictEqual(result['User-Agent'], 'vizzly-cli/1.0.0 (test)');
  });
});

describe('buildQueryParams', () => {
  it('builds query string from object', () => {
    let result = buildQueryParams({ limit: 50, offset: 0 });

    assert.strictEqual(result, 'limit=50&offset=0');
  });

  it('omits null and undefined values', () => {
    let result = buildQueryParams({
      name: 'test',
      branch: null,
      limit: undefined,
    });

    assert.strictEqual(result, 'name=test');
  });

  it('returns empty string for empty object', () => {
    let result = buildQueryParams({});

    assert.strictEqual(result, '');
  });
});

describe('parseApiError', () => {
  it('builds error message with status and body', () => {
    let result = parseApiError(404, 'Not found', 'https://api.test/builds/123');

    assert.ok(result.message.includes('404'));
    assert.ok(result.message.includes('Not found'));
    assert.ok(result.message.includes('https://api.test/builds/123'));
    assert.strictEqual(result.code, 'NOT_FOUND');
  });

  it('identifies auth errors', () => {
    let result = parseApiError(401, 'Unauthorized', 'https://api.test/');

    assert.strictEqual(result.code, 'AUTH_ERROR');
  });

  it('identifies server errors', () => {
    let result = parseApiError(500, 'Internal error', 'https://api.test/');

    assert.strictEqual(result.code, 'SERVER_ERROR');
  });

  it('preserves structured API error codes and messages', () => {
    let result = parseApiError(
      409,
      JSON.stringify({
        error: 'Context evidence changed; request the first page again',
        details: { code: 'CONTEXT_CURSOR_STALE' },
      }),
      'https://api.test/context'
    );

    assert.strictEqual(result.code, 'CONTEXT_CURSOR_STALE');
    assert.strictEqual(result.details.code, 'CONTEXT_CURSOR_STALE');
    assert.match(result.message, /Context evidence changed/);
    assert.ok(!result.message.includes('{"error"'));
  });
});

describe('isAuthError', () => {
  it('returns true for 401', () => {
    assert.strictEqual(isAuthError(401), true);
  });

  it('returns false for other status codes', () => {
    assert.strictEqual(isAuthError(200), false);
    assert.strictEqual(isAuthError(403), false);
    assert.strictEqual(isAuthError(500), false);
  });
});

describe('shouldRetryWithRefresh', () => {
  it('returns true for 401 on first attempt with refresh token', () => {
    assert.strictEqual(shouldRetryWithRefresh(401, false, true), true);
  });

  it('returns false if already a retry', () => {
    assert.strictEqual(shouldRetryWithRefresh(401, true, true), false);
  });

  it('returns false if no refresh token', () => {
    assert.strictEqual(shouldRetryWithRefresh(401, false, false), false);
  });

  it('returns false for non-401 status', () => {
    assert.strictEqual(shouldRetryWithRefresh(403, false, true), false);
  });
});

describe('isRateLimited', () => {
  it('returns true for 429', () => {
    assert.strictEqual(isRateLimited(429), true);
  });

  it('returns false for other status codes', () => {
    assert.strictEqual(isRateLimited(200), false);
    assert.strictEqual(isRateLimited(401), false);
    assert.strictEqual(isRateLimited(500), false);
  });
});

describe('parseApiError - additional cases', () => {
  it('identifies forbidden errors', () => {
    let result = parseApiError(403, 'Forbidden', 'https://api.test/');

    assert.strictEqual(result.code, 'FORBIDDEN');
  });

  it('identifies rate limited errors', () => {
    let result = parseApiError(429, 'Too many requests', 'https://api.test/');

    assert.strictEqual(result.code, 'RATE_LIMITED');
  });

  it('handles empty body', () => {
    let result = parseApiError(400, '', 'https://api.test/');

    assert.ok(result.message.includes('400'));
    assert.strictEqual(result.code, 'API_ERROR');
  });
});

describe('extractErrorBody', () => {
  it('extracts text from response', async () => {
    let mockResponse = {
      text: async () => 'Error message',
    };

    let result = await extractErrorBody(mockResponse);

    assert.strictEqual(result, 'Error message');
  });

  it('falls back to statusText when text() not available', async () => {
    let mockResponse = {
      statusText: 'Not Found',
    };

    let result = await extractErrorBody(mockResponse);

    assert.strictEqual(result, 'Not Found');
  });

  it('returns empty string on error', async () => {
    let mockResponse = {
      text: async () => {
        throw new Error('fail');
      },
    };

    let result = await extractErrorBody(mockResponse);

    assert.strictEqual(result, '');
  });
});

describe('buildApiUrl', () => {
  it('joins base URL and endpoint', () => {
    let result = buildApiUrl('https://api.vizzly.dev', '/builds');

    assert.strictEqual(result, 'https://api.vizzly.dev/builds');
  });

  it('removes trailing slash from base', () => {
    let result = buildApiUrl('https://api.vizzly.dev/', '/builds');

    assert.strictEqual(result, 'https://api.vizzly.dev/builds');
  });

  it('adds leading slash to endpoint if missing', () => {
    let result = buildApiUrl('https://api.vizzly.dev', 'builds');

    assert.strictEqual(result, 'https://api.vizzly.dev/builds');
  });
});

describe('buildEndpointWithParams', () => {
  it('appends query params to endpoint', () => {
    let result = buildEndpointWithParams('/builds', { limit: 10 });

    assert.strictEqual(result, '/builds?limit=10');
  });

  it('returns endpoint unchanged when no params', () => {
    let result = buildEndpointWithParams('/builds', {});

    assert.strictEqual(result, '/builds');
  });

  it('returns endpoint unchanged when params undefined', () => {
    let result = buildEndpointWithParams('/builds');

    assert.strictEqual(result, '/builds');
  });
});
