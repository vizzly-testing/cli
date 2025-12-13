/**
 * Tests for API core pure functions
 *
 * These tests require NO mocking - they test pure functions with input/output assertions.
 */

import { describe, expect, it } from 'vitest';
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

      expect(result).toEqual({ Authorization: 'Bearer abc123' });
    });

    it('returns empty object for null token', () => {
      let result = buildAuthHeader(null);

      expect(result).toEqual({});
    });

    it('returns empty object for undefined token', () => {
      let result = buildAuthHeader(undefined);

      expect(result).toEqual({});
    });
  });

  describe('buildUserAgent', () => {
    it('builds user agent with version and command', () => {
      let result = buildUserAgent('1.2.3', 'upload');

      expect(result).toBe('vizzly-cli/1.2.3 (upload)');
    });

    it('appends SDK user agent when provided', () => {
      let result = buildUserAgent('1.2.3', 'run', 'playwright/1.40.0');

      expect(result).toBe('vizzly-cli/1.2.3 (run) playwright/1.40.0');
    });

    it('ignores null SDK user agent', () => {
      let result = buildUserAgent('1.2.3', 'tdd', null);

      expect(result).toBe('vizzly-cli/1.2.3 (tdd)');
    });
  });

  describe('buildRequestHeaders', () => {
    it('builds headers with token and user agent', () => {
      let result = buildRequestHeaders({
        token: 'my-token',
        userAgent: 'vizzly-cli/1.0.0 (test)',
      });

      expect(result).toEqual({
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

      expect(result['Content-Type']).toBe('application/json');
    });

    it('omits auth header when no token', () => {
      let result = buildRequestHeaders({
        token: null,
        userAgent: 'vizzly-cli/1.0.0 (test)',
      });

      expect(result.Authorization).toBeUndefined();
      expect(result['User-Agent']).toBe('vizzly-cli/1.0.0 (test)');
    });
  });

  describe('computeSha256', () => {
    it('computes deterministic hash for buffer', () => {
      let buffer = Buffer.from('hello world');
      let result = computeSha256(buffer);

      // Known SHA256 of "hello world"
      expect(result).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      );
    });

    it('returns different hash for different content', () => {
      let hash1 = computeSha256(Buffer.from('hello'));
      let hash2 = computeSha256(Buffer.from('world'));

      expect(hash1).not.toBe(hash2);
    });

    it('returns 64 character hex string', () => {
      let result = computeSha256(Buffer.from('test'));

      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('buildQueryParams', () => {
    it('builds query string from object', () => {
      let result = buildQueryParams({ limit: 50, offset: 0 });

      expect(result).toBe('limit=50&offset=0');
    });

    it('omits null and undefined values', () => {
      let result = buildQueryParams({
        name: 'test',
        branch: null,
        limit: undefined,
      });

      expect(result).toBe('name=test');
    });

    it('returns empty string for empty object', () => {
      let result = buildQueryParams({});

      expect(result).toBe('');
    });
  });

  describe('parseApiError', () => {
    it('builds error message with status and body', () => {
      let result = parseApiError(
        404,
        'Not found',
        'https://api.test/builds/123'
      );

      expect(result.message).toContain('404');
      expect(result.message).toContain('Not found');
      expect(result.message).toContain('https://api.test/builds/123');
      expect(result.code).toBe('NOT_FOUND');
    });

    it('identifies auth errors', () => {
      let result = parseApiError(401, 'Unauthorized', 'https://api.test/');

      expect(result.code).toBe('AUTH_ERROR');
    });

    it('identifies server errors', () => {
      let result = parseApiError(500, 'Internal error', 'https://api.test/');

      expect(result.code).toBe('SERVER_ERROR');
    });
  });

  describe('isAuthError', () => {
    it('returns true for 401', () => {
      expect(isAuthError(401)).toBe(true);
    });

    it('returns false for other status codes', () => {
      expect(isAuthError(200)).toBe(false);
      expect(isAuthError(403)).toBe(false);
      expect(isAuthError(500)).toBe(false);
    });
  });

  describe('shouldRetryWithRefresh', () => {
    it('returns true for 401 on first attempt with refresh token', () => {
      expect(shouldRetryWithRefresh(401, false, true)).toBe(true);
    });

    it('returns false if already a retry', () => {
      expect(shouldRetryWithRefresh(401, true, true)).toBe(false);
    });

    it('returns false if no refresh token', () => {
      expect(shouldRetryWithRefresh(401, false, false)).toBe(false);
    });

    it('returns false for non-401 status', () => {
      expect(shouldRetryWithRefresh(403, false, true)).toBe(false);
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

      expect(result.existing).toHaveLength(2);
      expect(result.toUpload).toHaveLength(1);
      expect(result.toUpload[0].name).toBe('two');
    });

    it('works with Set input', () => {
      let screenshots = [{ sha256: 'aaa', name: 'one' }];
      let existingShas = new Set(['aaa']);

      let result = partitionByShaExistence(screenshots, existingShas);

      expect(result.existing).toHaveLength(1);
      expect(result.toUpload).toHaveLength(0);
    });

    it('handles empty existing set', () => {
      let screenshots = [{ sha256: 'aaa', name: 'one' }];

      let result = partitionByShaExistence(screenshots, []);

      expect(result.existing).toHaveLength(0);
      expect(result.toUpload).toHaveLength(1);
    });
  });
});
