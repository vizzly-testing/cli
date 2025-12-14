/**
 * Tests for API core pure functions
 *
 * These tests require NO mocking - they test pure functions with input/output assertions.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildAuthHeader,
  buildQueryParams,
  buildRequestHeaders,
  buildUserAgent,
  computeSha256,
  isAuthError,
  parseApiError,
  partitionByShaExistence,
  shouldRetryWithRefresh,
} from '../../src/api/core.js';

describe('api/core', () => {
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
      let result = buildUserAgent('1.2.3', 'upload');

      assert.strictEqual(result, 'vizzly-cli/1.2.3 (upload)');
    });

    it('appends SDK user agent when provided', () => {
      let result = buildUserAgent('1.2.3', 'run', 'playwright/1.40.0');

      assert.strictEqual(result, 'vizzly-cli/1.2.3 (run) playwright/1.40.0');
    });

    it('ignores null SDK user agent', () => {
      let result = buildUserAgent('1.2.3', 'tdd', null);

      assert.strictEqual(result, 'vizzly-cli/1.2.3 (tdd)');
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

  describe('computeSha256', () => {
    it('computes deterministic hash for buffer', () => {
      let buffer = Buffer.from('hello world');
      let result = computeSha256(buffer);

      // Known SHA256 of "hello world"
      assert.strictEqual(
        result,
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      );
    });

    it('returns different hash for different content', () => {
      let hash1 = computeSha256(Buffer.from('hello'));
      let hash2 = computeSha256(Buffer.from('world'));

      assert.notStrictEqual(hash1, hash2);
    });

    it('returns 64 character hex string', () => {
      let result = computeSha256(Buffer.from('test'));

      assert.match(result, /^[a-f0-9]{64}$/);
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
      let result = parseApiError(
        404,
        'Not found',
        'https://api.test/builds/123'
      );

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

  describe('partitionByShaExistence', () => {
    it('partitions screenshots by existing SHAs', () => {
      let screenshots = [
        { sha256: 'aaa', name: 'one' },
        { sha256: 'bbb', name: 'two' },
        { sha256: 'ccc', name: 'three' },
      ];
      let existingShas = ['aaa', 'ccc'];

      let result = partitionByShaExistence(screenshots, existingShas);

      assert.strictEqual(result.existing.length, 2);
      assert.strictEqual(result.toUpload.length, 1);
      assert.strictEqual(result.toUpload[0].name, 'two');
    });

    it('works with Set input', () => {
      let screenshots = [{ sha256: 'aaa', name: 'one' }];
      let existingShas = new Set(['aaa']);

      let result = partitionByShaExistence(screenshots, existingShas);

      assert.strictEqual(result.existing.length, 1);
      assert.strictEqual(result.toUpload.length, 0);
    });

    it('handles empty existing set', () => {
      let screenshots = [{ sha256: 'aaa', name: 'one' }];

      let result = partitionByShaExistence(screenshots, []);

      assert.strictEqual(result.existing.length, 0);
      assert.strictEqual(result.toUpload.length, 1);
    });
  });
});
