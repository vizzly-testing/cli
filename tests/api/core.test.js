/**
 * Tests for API core pure functions
 *
 * These tests require NO mocking - they test pure functions with input/output assertions.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildApiUrl,
  buildAuthHeader,
  buildBuildPayload,
  buildEndpointWithParams,
  buildQueryParams,
  buildRequestHeaders,
  buildScreenshotCheckObject,
  buildScreenshotPayload,
  buildShaCheckPayload,
  buildUserAgent,
  computeSha256,
  extractErrorBody,
  findScreenshotBySha,
  isAuthError,
  isRateLimited,
  parseApiError,
  partitionByShaExistence,
  shaExists,
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

  describe('buildScreenshotPayload', () => {
    it('builds payload with name, base64 image, and metadata', () => {
      let buffer = Buffer.from('fake-image-data');
      let result = buildScreenshotPayload('homepage', buffer, {
        browser: 'firefox',
      });

      assert.strictEqual(result.name, 'homepage');
      assert.strictEqual(result.image_data, buffer.toString('base64'));
      assert.deepStrictEqual(result.properties, { browser: 'firefox' });
      assert.strictEqual(result.sha256, undefined);
    });

    it('includes sha256 when provided', () => {
      let buffer = Buffer.from('image');
      let result = buildScreenshotPayload('test', buffer, {}, 'abc123');

      assert.strictEqual(result.sha256, 'abc123');
    });

    it('defaults metadata to empty object', () => {
      let buffer = Buffer.from('image');
      let result = buildScreenshotPayload('test', buffer);

      assert.deepStrictEqual(result.properties, {});
    });

    it('handles null metadata', () => {
      let buffer = Buffer.from('image');
      let result = buildScreenshotPayload('test', buffer, null);

      assert.deepStrictEqual(result.properties, {});
    });
  });

  describe('buildBuildPayload', () => {
    it('builds basic payload with name, branch, environment', () => {
      let result = buildBuildPayload({
        name: 'My Build',
        branch: 'main',
        environment: 'test',
      });

      assert.deepStrictEqual(result, {
        name: 'My Build',
        branch: 'main',
        environment: 'test',
      });
    });

    it('uses buildName as fallback for name', () => {
      let result = buildBuildPayload({
        buildName: 'Build Name',
        branch: 'main',
        environment: 'test',
      });

      assert.strictEqual(result.name, 'Build Name');
    });

    it('includes commit_sha when commit provided', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        commit: 'abc123',
      });

      assert.strictEqual(result.commit_sha, 'abc123');
    });

    it('uses commit_sha field directly', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        commit_sha: 'def456',
      });

      assert.strictEqual(result.commit_sha, 'def456');
    });

    it('includes commit_message when message provided', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        message: 'fix: bug',
      });

      assert.strictEqual(result.commit_message, 'fix: bug');
    });

    it('includes github_pull_request_number when pullRequestNumber provided', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        pullRequestNumber: 123,
      });

      assert.strictEqual(result.github_pull_request_number, 123);
    });

    it('includes parallel_id when parallelId provided', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        parallelId: 'parallel-abc',
      });

      assert.strictEqual(result.parallel_id, 'parallel-abc');
    });

    it('includes threshold when provided', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        threshold: 2.5,
      });

      assert.strictEqual(result.threshold, 2.5);
    });

    it('includes metadata when provided', () => {
      let result = buildBuildPayload({
        name: 'Build',
        branch: 'main',
        environment: 'test',
        metadata: { ci: 'github' },
      });

      assert.deepStrictEqual(result.metadata, { ci: 'github' });
    });
  });

  describe('buildShaCheckPayload', () => {
    it('builds signature-based payload for object screenshots', () => {
      let screenshots = [{ sha256: 'abc', name: 'test', browser: 'chrome' }];
      let result = buildShaCheckPayload(screenshots, 'build-123');

      assert.deepStrictEqual(result, {
        buildId: 'build-123',
        screenshots,
      });
    });

    it('builds legacy payload for string SHA array', () => {
      let shas = ['abc', 'def'];
      let result = buildShaCheckPayload(shas, 'build-123');

      assert.deepStrictEqual(result, {
        shas: ['abc', 'def'],
        buildId: 'build-123',
      });
    });

    it('handles empty array', () => {
      let result = buildShaCheckPayload([], 'build-123');

      assert.deepStrictEqual(result, {
        shas: [],
        buildId: 'build-123',
      });
    });
  });

  describe('buildScreenshotCheckObject', () => {
    it('builds check object with defaults', () => {
      let result = buildScreenshotCheckObject('sha123', 'homepage');

      assert.deepStrictEqual(result, {
        sha256: 'sha123',
        name: 'homepage',
        browser: 'chrome',
        viewport_width: 1920,
        viewport_height: 1080,
      });
    });

    it('uses metadata values when provided', () => {
      let result = buildScreenshotCheckObject('sha123', 'homepage', {
        browser: 'firefox',
        viewport: { width: 1280, height: 720 },
      });

      assert.strictEqual(result.browser, 'firefox');
      assert.strictEqual(result.viewport_width, 1280);
      assert.strictEqual(result.viewport_height, 720);
    });

    it('uses flat viewport_width/height from metadata', () => {
      let result = buildScreenshotCheckObject('sha123', 'homepage', {
        viewport_width: 800,
        viewport_height: 600,
      });

      assert.strictEqual(result.viewport_width, 800);
      assert.strictEqual(result.viewport_height, 600);
    });

    it('handles null metadata', () => {
      let result = buildScreenshotCheckObject('sha123', 'homepage', null);

      assert.strictEqual(result.browser, 'chrome');
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

  describe('shaExists', () => {
    it('returns true when SHA is in existing array', () => {
      let checkResult = { existing: ['abc', 'def'] };

      assert.strictEqual(shaExists(checkResult, 'abc'), true);
    });

    it('returns false when SHA is not in existing array', () => {
      let checkResult = { existing: ['abc', 'def'] };

      assert.strictEqual(shaExists(checkResult, 'xyz'), false);
    });

    it('returns false for null checkResult', () => {
      assert.strictEqual(shaExists(null, 'abc'), false);
    });

    it('returns false for missing existing array', () => {
      assert.strictEqual(shaExists({}, 'abc'), false);
    });
  });

  describe('findScreenshotBySha', () => {
    it('finds screenshot by SHA', () => {
      let checkResult = {
        screenshots: [
          { sha256: 'abc', name: 'one' },
          { sha256: 'def', name: 'two' },
        ],
      };

      let result = findScreenshotBySha(checkResult, 'def');

      assert.deepStrictEqual(result, { sha256: 'def', name: 'two' });
    });

    it('returns null when SHA not found', () => {
      let checkResult = { screenshots: [{ sha256: 'abc', name: 'one' }] };

      assert.strictEqual(findScreenshotBySha(checkResult, 'xyz'), null);
    });

    it('returns null for null checkResult', () => {
      assert.strictEqual(findScreenshotBySha(null, 'abc'), null);
    });

    it('returns null for missing screenshots array', () => {
      assert.strictEqual(findScreenshotBySha({}, 'abc'), null);
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
});
