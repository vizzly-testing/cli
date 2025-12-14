import { describe, expect, it } from 'vitest';
import {
  buildBadRequestResponse,
  buildErrorResponse,
  buildInternalErrorResponse,
  buildNotFoundResponse,
  buildServerListenOptions,
  buildServerStartedMessage,
  buildServerStoppedMessage,
  buildSuccessResponse,
  extractScreenshotData,
  getEffectiveBuildId,
  isScreenshotEndpoint,
  validateScreenshotRequest,
} from '../../src/screenshot-server/core.js';

describe('screenshot-server/core', () => {
  describe('validateScreenshotRequest', () => {
    it('returns valid for complete request', () => {
      let result = validateScreenshotRequest({
        name: 'test-screenshot',
        image: 'base64-data',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid when name is missing', () => {
      let result = validateScreenshotRequest({ image: 'base64-data' });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('name and image are required');
    });

    it('returns invalid when image is missing', () => {
      let result = validateScreenshotRequest({ name: 'test-screenshot' });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('name and image are required');
    });

    it('returns invalid when both are missing', () => {
      let result = validateScreenshotRequest({});

      expect(result.valid).toBe(false);
      expect(result.error).toBe('name and image are required');
    });

    it('returns invalid for null body', () => {
      let result = validateScreenshotRequest(null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('name and image are required');
    });

    it('returns invalid for undefined body', () => {
      let result = validateScreenshotRequest(undefined);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('name and image are required');
    });

    it('accepts request with additional properties', () => {
      let result = validateScreenshotRequest({
        name: 'test',
        image: 'data',
        buildId: 'build-123',
        properties: { viewport: '1920x1080' },
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('isScreenshotEndpoint', () => {
    it('returns true for POST /screenshot', () => {
      expect(isScreenshotEndpoint('POST', '/screenshot')).toBe(true);
    });

    it('returns false for GET /screenshot', () => {
      expect(isScreenshotEndpoint('GET', '/screenshot')).toBe(false);
    });

    it('returns false for POST /other', () => {
      expect(isScreenshotEndpoint('POST', '/other')).toBe(false);
    });

    it('returns false for POST /screenshots (plural)', () => {
      expect(isScreenshotEndpoint('POST', '/screenshots')).toBe(false);
    });

    it('returns false for PUT /screenshot', () => {
      expect(isScreenshotEndpoint('PUT', '/screenshot')).toBe(false);
    });

    it('returns false for DELETE /screenshot', () => {
      expect(isScreenshotEndpoint('DELETE', '/screenshot')).toBe(false);
    });
  });

  describe('getEffectiveBuildId', () => {
    it('returns provided buildId', () => {
      expect(getEffectiveBuildId('build-123')).toBe('build-123');
    });

    it('returns default for null', () => {
      expect(getEffectiveBuildId(null)).toBe('default');
    });

    it('returns default for undefined', () => {
      expect(getEffectiveBuildId(undefined)).toBe('default');
    });

    it('returns default for empty string', () => {
      expect(getEffectiveBuildId('')).toBe('default');
    });
  });

  describe('buildSuccessResponse', () => {
    it('returns correct success response', () => {
      let response = buildSuccessResponse();

      expect(response).toEqual({
        status: 200,
        body: { success: true },
      });
    });
  });

  describe('buildErrorResponse', () => {
    it('returns error response with status and message', () => {
      let response = buildErrorResponse(400, 'Bad Request');

      expect(response).toEqual({
        status: 400,
        body: { error: 'Bad Request' },
      });
    });

    it('works with any status code', () => {
      let response = buildErrorResponse(503, 'Service Unavailable');

      expect(response).toEqual({
        status: 503,
        body: { error: 'Service Unavailable' },
      });
    });
  });

  describe('buildNotFoundResponse', () => {
    it('returns 404 not found response', () => {
      let response = buildNotFoundResponse();

      expect(response).toEqual({
        status: 404,
        body: { error: 'Not found' },
      });
    });
  });

  describe('buildBadRequestResponse', () => {
    it('returns 400 response with custom message', () => {
      let response = buildBadRequestResponse('Missing required field');

      expect(response).toEqual({
        status: 400,
        body: { error: 'Missing required field' },
      });
    });
  });

  describe('buildInternalErrorResponse', () => {
    it('returns 500 internal error response', () => {
      let response = buildInternalErrorResponse();

      expect(response).toEqual({
        status: 500,
        body: { error: 'Internal server error' },
      });
    });
  });

  describe('buildServerListenOptions', () => {
    it('returns port and host from config', () => {
      let config = { server: { port: 8080 } };
      let options = buildServerListenOptions(config);

      expect(options).toEqual({
        port: 8080,
        host: '127.0.0.1',
      });
    });

    it('returns default port when not configured', () => {
      let options = buildServerListenOptions({});

      expect(options).toEqual({
        port: 3000,
        host: '127.0.0.1',
      });
    });

    it('returns default port for null config', () => {
      let options = buildServerListenOptions(null);

      expect(options).toEqual({
        port: 3000,
        host: '127.0.0.1',
      });
    });

    it('returns default port for undefined config', () => {
      let options = buildServerListenOptions(undefined);

      expect(options).toEqual({
        port: 3000,
        host: '127.0.0.1',
      });
    });
  });

  describe('buildServerStartedMessage', () => {
    it('includes port in message', () => {
      let message = buildServerStartedMessage(8080);

      expect(message).toBe(
        'Screenshot server listening on http://127.0.0.1:8080'
      );
    });

    it('works with different ports', () => {
      expect(buildServerStartedMessage(3001)).toBe(
        'Screenshot server listening on http://127.0.0.1:3001'
      );
      expect(buildServerStartedMessage(47392)).toBe(
        'Screenshot server listening on http://127.0.0.1:47392'
      );
    });
  });

  describe('buildServerStoppedMessage', () => {
    it('returns stopped message', () => {
      let message = buildServerStoppedMessage();

      expect(message).toBe('Screenshot server stopped');
    });
  });

  describe('extractScreenshotData', () => {
    it('extracts name, image, and properties', () => {
      let body = {
        buildId: 'build-123',
        name: 'test-screenshot',
        image: 'base64-data',
        properties: { viewport: '1920x1080', browser: 'chrome' },
      };

      let data = extractScreenshotData(body);

      expect(data).toEqual({
        name: 'test-screenshot',
        image: 'base64-data',
        properties: { viewport: '1920x1080', browser: 'chrome' },
      });
    });

    it('excludes buildId from extracted data', () => {
      let body = {
        buildId: 'build-123',
        name: 'test',
        image: 'data',
      };

      let data = extractScreenshotData(body);

      expect(data).not.toHaveProperty('buildId');
    });

    it('handles missing properties', () => {
      let body = {
        name: 'test',
        image: 'data',
      };

      let data = extractScreenshotData(body);

      expect(data).toEqual({
        name: 'test',
        image: 'data',
        properties: undefined,
      });
    });
  });
});
