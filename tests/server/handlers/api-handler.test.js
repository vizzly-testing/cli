import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApiHandler } from '../../../src/server/handlers/api-handler.js';

describe('server/handlers/api-handler', () => {
  let testDir = join(process.cwd(), '.test-api-handler');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createApiHandler', () => {
    it('creates handler with required methods', () => {
      let handler = createApiHandler(null);

      assert.strictEqual(typeof handler.handleScreenshot, 'function');
      assert.strictEqual(typeof handler.getScreenshotCount, 'function');
      assert.strictEqual(typeof handler.flush, 'function');
      assert.strictEqual(typeof handler.cleanup, 'function');
    });

    it('getScreenshotCount returns 0 initially', () => {
      let handler = createApiHandler(null);

      assert.strictEqual(handler.getScreenshotCount(), 0);
    });
  });

  describe('handleScreenshot', () => {
    it('returns error when client is null', async () => {
      let handler = createApiHandler(null);

      let result = await handler.handleScreenshot(
        'build-123',
        'test',
        'base64data'
      );

      assert.strictEqual(result.statusCode, 500);
      assert.ok(result.body.error.includes('not available'));
    });

    it('handles base64 image data', async () => {
      let uploadedData = null;
      let mockUploadScreenshot = async (
        client,
        buildId,
        name,
        buffer,
        props
      ) => {
        uploadedData = { buildId, name, buffer, props };
        return { success: true };
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      // Create a valid base64 PNG header
      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      let result = await handler.handleScreenshot(
        'build-123',
        'test-screenshot',
        base64Image,
        { viewport: '1920x1080' }
      );

      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.body.success, true);
      assert.strictEqual(result.body.name, 'test-screenshot');
      assert.strictEqual(result.body.count, 1);

      // Wait for background upload
      await handler.flush();

      assert.strictEqual(uploadedData.buildId, 'build-123');
      assert.strictEqual(uploadedData.name, 'test-screenshot');
      assert.ok(Buffer.isBuffer(uploadedData.buffer));
    });

    it('handles file path image', async () => {
      let uploadedData = null;
      let mockUploadScreenshot = async (
        client,
        buildId,
        name,
        buffer,
        props
      ) => {
        uploadedData = { buildId, name, buffer, props };
        return { success: true };
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      // Create test image file
      let imagePath = join(testDir, 'test.png');
      let imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      writeFileSync(imagePath, imageData);

      let result = await handler.handleScreenshot(
        'build-123',
        'file-screenshot',
        `file://${imagePath}`
      );

      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.body.success, true);
      assert.strictEqual(result.body.count, 1);

      await handler.flush();

      assert.strictEqual(uploadedData.name, 'file-screenshot');
      assert.ok(Buffer.isBuffer(uploadedData.buffer));
    });

    it('returns 400 for non-existent file path', async () => {
      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: async () => ({ success: true }),
      });

      let result = await handler.handleScreenshot(
        'build-123',
        'test',
        'file:///nonexistent/path.png'
      );

      assert.strictEqual(result.statusCode, 400);
      assert.ok(result.body.error.includes('not found'));
    });

    it('returns 400 for invalid image input', async () => {
      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: async () => ({ success: true }),
      });

      let result = await handler.handleScreenshot(
        'build-123',
        'test',
        'not-valid-image-data'
      );

      assert.strictEqual(result.statusCode, 400);
      assert.ok(result.body.error.includes('Invalid image input'));
    });

    it('increments screenshot count', async () => {
      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: async () => ({ success: true }),
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      await handler.handleScreenshot('build-123', 'test1', base64Image);
      assert.strictEqual(handler.getScreenshotCount(), 1);

      await handler.handleScreenshot('build-123', 'test2', base64Image);
      assert.strictEqual(handler.getScreenshotCount(), 2);
    });

    it('disables uploads after error', async () => {
      let callCount = 0;
      let mockUploadScreenshot = async () => {
        callCount++;
        throw new Error('Upload failed');
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      // First call triggers upload
      await handler.handleScreenshot('build-123', 'test1', base64Image);
      await handler.flush();

      // Second call should be disabled
      let result = await handler.handleScreenshot(
        'build-123',
        'test2',
        base64Image
      );

      assert.strictEqual(result.body.disabled, true);
      assert.strictEqual(callCount, 1); // Only first call made it through
    });

    it('returns disabled response with correct count', async () => {
      let mockUploadScreenshot = async () => {
        throw new Error('Upload failed');
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      // First call triggers error
      await handler.handleScreenshot('build-123', 'test1', base64Image);
      await handler.flush();

      // Disabled calls still increment count
      let result = await handler.handleScreenshot(
        'build-123',
        'test2',
        base64Image
      );

      assert.strictEqual(result.body.count, 2);
      assert.ok(result.body.message.includes('2 screenshots'));
    });
  });

  describe('flush', () => {
    it('returns zeros when no uploads pending', async () => {
      let handler = createApiHandler(null);

      let result = await handler.flush();

      assert.deepStrictEqual(result, { uploaded: 0, failed: 0, total: 0 });
    });

    it('awaits all pending uploads', async () => {
      let completed = [];
      let mockUploadScreenshot = async (client, buildId, name) => {
        completed.push(name);
        return { success: true };
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      await handler.handleScreenshot('build-123', 'screenshot-1', base64Image);
      await handler.handleScreenshot('build-123', 'screenshot-2', base64Image);
      await handler.handleScreenshot('build-123', 'screenshot-3', base64Image);

      let result = await handler.flush();

      assert.strictEqual(result.uploaded, 3);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(result.total, 3);
      assert.deepStrictEqual(completed, [
        'screenshot-1',
        'screenshot-2',
        'screenshot-3',
      ]);
    });

    it('tracks failed uploads', async () => {
      let callCount = 0;
      let mockUploadScreenshot = async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Upload failed');
        }
        return { success: true };
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      await handler.handleScreenshot('build-123', 'screenshot-1', base64Image);
      await handler.handleScreenshot('build-123', 'screenshot-2', base64Image);
      await handler.handleScreenshot('build-123', 'screenshot-3', base64Image);

      let result = await handler.flush();

      assert.strictEqual(result.uploaded, 2);
      assert.strictEqual(result.failed, 1);
      assert.strictEqual(result.total, 3);
    });

    it('clears pending uploads after flush', async () => {
      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: async () => ({ success: true }),
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      await handler.handleScreenshot('build-123', 'test', base64Image);
      await handler.flush();

      // Second flush should return zeros
      let result = await handler.flush();

      assert.deepStrictEqual(result, { uploaded: 0, failed: 0, total: 0 });
    });
  });

  describe('cleanup', () => {
    it('resets state', async () => {
      let mockUploadScreenshot = async () => {
        throw new Error('fail');
      };

      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: mockUploadScreenshot,
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      // Trigger disabled state
      await handler.handleScreenshot('build-123', 'test', base64Image);
      await handler.flush();

      // Verify disabled
      let result1 = await handler.handleScreenshot(
        'build-123',
        'test2',
        base64Image
      );
      assert.strictEqual(result1.body.disabled, true);

      // Cleanup
      handler.cleanup();

      // Replace with working upload
      let newHandler = createApiHandler(mockClient, {
        uploadScreenshot: async () => ({ success: true }),
      });

      // Should work again
      let result2 = await newHandler.handleScreenshot(
        'build-123',
        'test3',
        base64Image
      );
      assert.strictEqual(result2.body.disabled, undefined);
      assert.strictEqual(newHandler.getScreenshotCount(), 1);
    });

    it('resets screenshot count', async () => {
      let mockClient = { request: async () => ({}) };
      let handler = createApiHandler(mockClient, {
        uploadScreenshot: async () => ({ success: true }),
      });

      let pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      let base64Image = pngHeader.toString('base64');

      await handler.handleScreenshot('build-123', 'test', base64Image);
      assert.strictEqual(handler.getScreenshotCount(), 1);

      handler.cleanup();
      assert.strictEqual(handler.getScreenshotCount(), 0);
    });
  });
});
