import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiHandler } from '../../../src/server/handlers/api-handler.js';

// Mock dependencies
vi.mock('../../../src/utils/logger-factory.js', () => ({
  createServiceLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('createApiHandler', () => {
  let mockApiService;
  let handler;

  beforeEach(() => {
    mockApiService = {
      uploadScreenshot: vi.fn(),
    };

    handler = createApiHandler(mockApiService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleScreenshot', () => {
    const buildId = 'test-build-123';
    const screenshotName = 'test-screenshot';
    // Use actual valid base64 encoded image data
    const imageData = Buffer.from('fake-png-image-data').toString('base64');
    const properties = { viewport: '1920x1080' };

    it('should handle successful screenshot upload', async () => {
      const mockUploadResult = {
        message: 'Screenshot uploaded successfully',
        skipped: false,
      };
      mockApiService.uploadScreenshot.mockResolvedValue(mockUploadResult);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      // Response should be immediate (non-blocking)
      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.name).toBe(screenshotName);
      expect(result.body.count).toBe(1);

      // Upload happens in background - flush to wait for it
      await handler.flush();

      expect(mockApiService.uploadScreenshot).toHaveBeenCalledWith(
        buildId,
        screenshotName,
        expect.any(Buffer),
        properties
      );
    });

    it('should handle skipped screenshot upload', async () => {
      const mockUploadResult = {
        message: 'Screenshot already exists, skipped upload',
        skipped: true,
      };
      mockApiService.uploadScreenshot.mockResolvedValue(mockUploadResult);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      // Response is immediate - count increments optimistically
      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.count).toBe(1);

      // Flush to complete background upload
      const stats = await handler.flush();
      expect(stats.uploaded).toBe(1); // Skipped uploads count as successful
    });

    it('should handle multiple successful uploads', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      await handler.handleScreenshot(buildId, 'screenshot1', imageData);
      const result = await handler.handleScreenshot(
        buildId,
        'screenshot2',
        imageData
      );

      expect(result.body.count).toBe(2);
    });

    it('should handle upload error and disable Vizzly', async () => {
      const uploadError = new Error('Network timeout');
      mockApiService.uploadScreenshot.mockRejectedValue(uploadError);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      // Response is immediate - error happens in background
      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.count).toBe(1);

      // Flush to see the error
      const stats = await handler.flush();
      expect(stats.failed).toBe(1);
      expect(stats.uploaded).toBe(0);
    });

    it('should continue returning disabled responses after first error', async () => {
      // First request fails
      mockApiService.uploadScreenshot.mockRejectedValue(new Error('Failed'));
      await handler.handleScreenshot(buildId, 'screenshot1', imageData);

      // Wait for error to propagate
      await handler.flush();

      // Second request should return disabled response without calling API
      mockApiService.uploadScreenshot.mockClear();
      const result = await handler.handleScreenshot(
        buildId,
        'screenshot2',
        imageData
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.disabled).toBe(true);
      expect(mockApiService.uploadScreenshot).not.toHaveBeenCalled();
    });

    it('should handle missing buildId by allowing upload', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      const result = await handler.handleScreenshot(
        null,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);

      // Flush to complete background upload
      await handler.flush();

      expect(mockApiService.uploadScreenshot).toHaveBeenCalledWith(
        null,
        screenshotName,
        Buffer.from(imageData, 'base64'),
        properties
      );
    });

    it('should handle undefined buildId by allowing upload', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      const result = await handler.handleScreenshot(
        undefined,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);

      // Flush to complete background upload
      await handler.flush();

      expect(mockApiService.uploadScreenshot).toHaveBeenCalledWith(
        undefined,
        screenshotName,
        Buffer.from(imageData, 'base64'),
        properties
      );
    });

    it('should handle missing API service', async () => {
      const handlerWithoutApi = createApiHandler(null);

      const result = await handlerWithoutApi.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(500);
      expect(result.body.error).toBe('API service not available');
    });

    it('should handle screenshots without properties', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData
      );

      expect(result.statusCode).toBe(200);
      expect(mockApiService.uploadScreenshot).toHaveBeenCalledWith(
        buildId,
        screenshotName,
        expect.any(Buffer),
        {}
      );
    });

    it('should handle null properties', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        null
      );

      expect(result.statusCode).toBe(200);
      expect(mockApiService.uploadScreenshot).toHaveBeenCalledWith(
        buildId,
        screenshotName,
        expect.any(Buffer),
        {}
      );
    });

    it('should properly convert base64 to Buffer', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      await handler.handleScreenshot(buildId, screenshotName, 'dGVzdA=='); // "test" in base64

      const callArgs = mockApiService.uploadScreenshot.mock.calls[0];
      const buffer = callArgs[2];
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('test');
    });
  });

  describe('getScreenshotCount', () => {
    it('should return current screenshot count', () => {
      expect(handler.getScreenshotCount()).toBe(0);
    });

    it('should return count after successful uploads', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });

      await handler.handleScreenshot('build1', 'screenshot1', 'data');
      expect(handler.getScreenshotCount()).toBe(1);

      await handler.handleScreenshot('build1', 'screenshot2', 'data');
      expect(handler.getScreenshotCount()).toBe(2);
    });

    it('should increment count immediately for all uploads', async () => {
      mockApiService.uploadScreenshot
        .mockResolvedValueOnce({ skipped: false })
        .mockResolvedValueOnce({ skipped: true });

      await handler.handleScreenshot('build1', 'screenshot1', 'data');
      await handler.handleScreenshot('build1', 'screenshot2', 'data');

      // Count increments optimistically for all uploads (including skipped)
      expect(handler.getScreenshotCount()).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should reset state', async () => {
      // Upload some screenshots first
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });
      await handler.handleScreenshot('build1', 'screenshot1', 'data');

      // Cause an error to disable Vizzly
      mockApiService.uploadScreenshot.mockRejectedValue(new Error('Failed'));
      await handler.handleScreenshot('build1', 'screenshot2', 'data');

      // Wait for background uploads to complete
      await handler.flush();

      // Count increments optimistically for both uploads
      expect(handler.getScreenshotCount()).toBe(2);

      // Cleanup should reset everything
      handler.cleanup();

      expect(handler.getScreenshotCount()).toBe(0);

      // Should be able to upload again after cleanup
      mockApiService.uploadScreenshot.mockResolvedValue({ skipped: false });
      const result = await handler.handleScreenshot(
        'build1',
        'screenshot3',
        'data'
      );

      expect(result.body.disabled).toBeUndefined();
      expect(result.body.success).toBe(true);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle API service that throws synchronously', async () => {
      // Mock must return a promise that can have .then() called on it
      mockApiService.uploadScreenshot.mockImplementation(() => {
        return Promise.reject(new Error('Sync error'));
      });

      const result = await handler.handleScreenshot(
        'build1',
        'screenshot1',
        'data',
        {}
      );

      // Response is immediate
      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);

      // Wait for background error to propagate
      await handler.flush();

      // Next upload should be disabled
      mockApiService.uploadScreenshot.mockClear();
      const result2 = await handler.handleScreenshot(
        'build1',
        'screenshot2',
        'data',
        {}
      );

      expect(result2.body.disabled).toBe(true);
    });

    it('should handle API service returning undefined', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue(undefined);

      const result = await handler.handleScreenshot(
        'build1',
        'screenshot1',
        'data',
        {}
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.skipped).toBeUndefined();
    });

    it('should handle API service returning null', async () => {
      mockApiService.uploadScreenshot.mockResolvedValue(null);

      const result = await handler.handleScreenshot(
        'build1',
        'screenshot1',
        'data',
        {}
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.skipped).toBeUndefined();
    });
  });
});
