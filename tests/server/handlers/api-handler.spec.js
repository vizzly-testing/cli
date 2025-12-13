/**
 * Tests for API handler
 *
 * NO vi.mock - uses dependency injection for testability
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiHandler } from '../../../src/server/handlers/api-handler.js';

/**
 * Create a mock upload function that records calls
 */
function createMockUpload(response = { skipped: false }) {
  let calls = [];
  let shouldReject = false;
  let rejectError = null;

  let fn = async (client, buildId, name, buffer, properties) => {
    calls.push({ client, buildId, name, buffer, properties });
    if (shouldReject) {
      throw rejectError || new Error('Upload failed');
    }
    return response;
  };

  fn.getCalls = () => calls;
  fn.getLastCall = () => calls[calls.length - 1];
  fn.setResponse = r => {
    response = r;
  };
  fn.reject = (error = new Error('Upload failed')) => {
    shouldReject = true;
    rejectError = error;
  };
  fn.resolve = () => {
    shouldReject = false;
  };

  return fn;
}

/**
 * Create a mock client
 */
function createMockClient() {
  return {
    request: async () => ({}),
    getBaseUrl: () => 'https://api.vizzly.dev',
    getToken: () => 'test-token',
    getUserAgent: () => 'vizzly-cli/test',
  };
}

describe('createApiHandler', () => {
  let mockClient;
  let mockUpload;
  let handler;

  beforeEach(() => {
    mockClient = createMockClient();
    mockUpload = createMockUpload();
    handler = createApiHandler(mockClient, { uploadScreenshot: mockUpload });
  });

  describe('handleScreenshot', () => {
    let buildId = 'test-build-123';
    let screenshotName = 'test-screenshot';
    let imageData = Buffer.from('fake-png-image-data').toString('base64');
    let properties = { viewport: '1920x1080' };

    it('returns 200 immediately (non-blocking)', async () => {
      let result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.name).toBe(screenshotName);
      expect(result.body.count).toBe(1);
    });

    it('calls uploadScreenshot with correct params after flush', async () => {
      await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      // Upload happens in background - flush to wait
      await handler.flush();

      let call = mockUpload.getLastCall();
      expect(call.client).toBe(mockClient);
      expect(call.buildId).toBe(buildId);
      expect(call.name).toBe(screenshotName);
      expect(Buffer.isBuffer(call.buffer)).toBe(true);
      expect(call.properties).toEqual(properties);
    });

    it('increments count for each screenshot', async () => {
      await handler.handleScreenshot(buildId, 'screenshot1', imageData);
      let result = await handler.handleScreenshot(
        buildId,
        'screenshot2',
        imageData
      );

      expect(result.body.count).toBe(2);
    });

    it('handles upload error by disabling Vizzly', async () => {
      mockUpload.reject(new Error('Network timeout'));

      // First screenshot returns success (non-blocking)
      let result1 = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData
      );
      expect(result1.statusCode).toBe(200);
      expect(result1.body.success).toBe(true);

      // Flush to let error propagate
      let stats = await handler.flush();
      expect(stats.failed).toBe(1);

      // Next screenshot returns disabled
      mockUpload.resolve(); // Reset for next call
      let result2 = await handler.handleScreenshot(
        buildId,
        'screenshot2',
        imageData
      );
      expect(result2.body.disabled).toBe(true);
    });

    it('returns error when no client provided', async () => {
      let handlerWithoutClient = createApiHandler(null, {
        uploadScreenshot: mockUpload,
      });

      let result = await handlerWithoutClient.handleScreenshot(
        buildId,
        screenshotName,
        imageData
      );

      expect(result.statusCode).toBe(500);
      expect(result.body.error).toBe('API client not available');
    });

    it('handles null buildId', async () => {
      let result = await handler.handleScreenshot(
        null,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);

      await handler.flush();

      let call = mockUpload.getLastCall();
      expect(call.buildId).toBeNull();
    });

    it('handles undefined buildId', async () => {
      let result = await handler.handleScreenshot(
        undefined,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);

      await handler.flush();

      let call = mockUpload.getLastCall();
      expect(call.buildId).toBeUndefined();
    });

    it('converts base64 to Buffer', async () => {
      // "test" in base64
      await handler.handleScreenshot(buildId, screenshotName, 'dGVzdA==');
      await handler.flush();

      let call = mockUpload.getLastCall();
      expect(Buffer.isBuffer(call.buffer)).toBe(true);
      expect(call.buffer.toString()).toBe('test');
    });

    it('defaults properties to empty object', async () => {
      await handler.handleScreenshot(buildId, screenshotName, imageData);
      await handler.flush();

      let call = mockUpload.getLastCall();
      expect(call.properties).toEqual({});
    });

    it('handles null properties', async () => {
      await handler.handleScreenshot(buildId, screenshotName, imageData, null);
      await handler.flush();

      let call = mockUpload.getLastCall();
      expect(call.properties).toEqual({});
    });
  });

  describe('getScreenshotCount', () => {
    it('returns 0 initially', () => {
      expect(handler.getScreenshotCount()).toBe(0);
    });

    it('returns count after screenshots', async () => {
      await handler.handleScreenshot('build1', 'screenshot1', 'data');
      expect(handler.getScreenshotCount()).toBe(1);

      await handler.handleScreenshot('build1', 'screenshot2', 'data');
      expect(handler.getScreenshotCount()).toBe(2);
    });
  });

  describe('flush', () => {
    it('returns stats for uploaded screenshots', async () => {
      await handler.handleScreenshot('build1', 'screenshot1', 'data');
      await handler.handleScreenshot('build1', 'screenshot2', 'data');

      let stats = await handler.flush();

      expect(stats.uploaded).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(2);
    });

    it('returns stats for failed uploads', async () => {
      mockUpload.reject(new Error('Failed'));

      await handler.handleScreenshot('build1', 'screenshot1', 'data');

      let stats = await handler.flush();

      expect(stats.uploaded).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it('returns zeros when no uploads', async () => {
      let stats = await handler.flush();

      expect(stats).toEqual({ uploaded: 0, failed: 0, total: 0 });
    });
  });

  describe('cleanup', () => {
    it('resets state', async () => {
      await handler.handleScreenshot('build1', 'screenshot1', 'data');
      mockUpload.reject(new Error('Failed'));
      await handler.handleScreenshot('build1', 'screenshot2', 'data');
      await handler.flush();

      expect(handler.getScreenshotCount()).toBe(2);

      handler.cleanup();

      expect(handler.getScreenshotCount()).toBe(0);

      // Should be able to upload again
      mockUpload.resolve();
      let result = await handler.handleScreenshot(
        'build1',
        'screenshot3',
        'data'
      );
      expect(result.body.disabled).toBeUndefined();
      expect(result.body.success).toBe(true);
    });
  });
});
