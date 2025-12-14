import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpServer } from '../../src/server/http-server.js';

// Mock dependencies
vi.mock('../../src/utils/logger-factory.js', () => ({
  createServiceLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('createHttpServer', () => {
  let mockHandler;
  let mockEmitter;
  let server;
  const testPort = 0; // Use 0 to get random available port

  beforeEach(() => {
    mockHandler = {
      handleScreenshot: vi.fn(),
      getScreenshotCount: vi.fn(),
    };

    mockEmitter = new EventEmitter();

    server = createHttpServer(testPort, mockHandler, mockEmitter);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    vi.clearAllMocks();
  });

  describe('server lifecycle', () => {
    it('should start and stop successfully', async () => {
      await server.start();
      expect(server.getServer()).toBeTruthy();

      await server.stop();
      expect(server.getServer()).toBe(null);
    });

    it('should handle multiple stop calls safely', async () => {
      await server.start();
      await server.stop();
      await server.stop(); // Should not throw
    });
  });

  describe('health endpoint', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should respond to GET /health', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(`http://127.0.0.1:${actualPort}/health`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.port).toBe(testPort);
      expect(typeof data.uptime).toBe('number');
    });

    it('should handle OPTIONS request', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(`http://127.0.0.1:${actualPort}/health`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(200);
    });
  });

  describe('screenshot endpoint', () => {
    beforeEach(async () => {
      await server.start();
    });

    const makeScreenshotRequest = async (body, options = {}) => {
      const actualPort = server.getServer().address().port;
      return fetch(`http://127.0.0.1:${actualPort}/screenshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(body),
        ...options,
      });
    };

    it('should handle valid screenshot request', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
        image: 'base64-image-data',
        properties: { viewport: '1920x1080' },
      };

      const handlerResponse = {
        statusCode: 200,
        body: { success: true, name: 'test-screenshot' },
      };

      mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);
      mockHandler.getScreenshotCount.mockReturnValue(1);

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.name).toBe('test-screenshot');

      expect(mockHandler.handleScreenshot).toHaveBeenCalledWith(
        'test-build',
        'test-screenshot',
        'base64-image-data',
        { viewport: '1920x1080' }
      );
    });

    it('should handle screenshot successfully', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
        image: 'base64-image-data',
      };

      const handlerResponse = {
        statusCode: 200,
        body: { success: true },
      };

      mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(200);
      expect(mockHandler.handleScreenshot).toHaveBeenCalled();
    });

    it('should not emit event on non-200 status', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
        image: 'base64-image-data',
      };

      const handlerResponse = {
        statusCode: 422,
        body: { error: 'Visual difference detected' },
      };

      mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);

      let eventEmitted = false;
      mockEmitter.once('screenshot-captured', () => {
        eventEmitted = true;
      });

      await makeScreenshotRequest(requestBody);

      // Event should not fire - check immediately since emission is synchronous
      expect(eventEmitted).toBe(false);
    });

    it('should handle missing buildId by using default', async () => {
      const requestBody = {
        name: 'test-screenshot',
        image: 'base64-image-data',
      };

      const handlerResponse = {
        statusCode: 200,
        body: { success: true, name: 'test-screenshot' },
      };

      mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);
      mockHandler.getScreenshotCount.mockReturnValue(1);

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      expect(mockHandler.handleScreenshot).toHaveBeenCalledWith(
        null,
        'test-screenshot',
        'base64-image-data',
        undefined
      );
    });

    it('should handle missing name', async () => {
      const requestBody = {
        buildId: 'test-build',
        image: 'base64-image-data',
      };

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('name and image are required');
    });

    it('should handle missing image', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
      };

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('name and image are required');
    });

    it('should handle invalid JSON', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(
        `http://127.0.0.1:${actualPort}/screenshot`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json{',
        }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process screenshot');
    });

    it('should handle handler throwing error', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
        image: 'base64-image-data',
      };

      mockHandler.handleScreenshot.mockRejectedValue(
        new Error('Handler error')
      );

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process screenshot');
    });

    it('should handle screenshot without properties', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
        image: 'base64-image-data',
      };

      const handlerResponse = {
        statusCode: 200,
        body: { success: true },
      };

      mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);

      await makeScreenshotRequest(requestBody);

      expect(mockHandler.handleScreenshot).toHaveBeenCalledWith(
        'test-build',
        'test-screenshot',
        'base64-image-data',
        undefined
      );
    });

    it('should pass through handler response status and body', async () => {
      const requestBody = {
        buildId: 'test-build',
        name: 'test-screenshot',
        image: 'base64-image-data',
      };

      const handlerResponse = {
        statusCode: 422,
        body: {
          error: 'Visual difference detected',
          details: 'Screenshot differs from baseline',
          tddMode: true,
        },
      };

      mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);

      const response = await makeScreenshotRequest(requestBody);

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data.error).toBe('Visual difference detected');
      expect(data.details).toBe('Screenshot differs from baseline');
      expect(data.tddMode).toBe(true);
    });
  });

  describe('CORS headers', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should set CORS headers on all responses', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(`http://127.0.0.1:${actualPort}/health`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, OPTIONS'
      );
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
        'Content-Type'
      );
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should handle OPTIONS preflight request', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(
        `http://127.0.0.1:${actualPort}/screenshot`,
        {
          method: 'OPTIONS',
        }
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('404 handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return 404 for unknown endpoints', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(`http://127.0.0.1:${actualPort}/unknown`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not found');
    });

    it('should return 404 for wrong method on screenshot endpoint', async () => {
      const actualPort = server.getServer().address().port;
      const response = await fetch(
        `http://127.0.0.1:${actualPort}/screenshot`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not found');
    });
  });

  describe('server without emitter', () => {
    it('should work without emitter', async () => {
      const serverWithoutEmitter = createHttpServer(0, mockHandler);
      await serverWithoutEmitter.start();

      try {
        const requestBody = {
          buildId: 'test-build',
          name: 'test-screenshot',
          image: 'base64-image-data',
        };

        const handlerResponse = {
          statusCode: 200,
          body: { success: true },
        };

        mockHandler.handleScreenshot.mockResolvedValue(handlerResponse);

        const actualPort = serverWithoutEmitter.getServer().address().port;
        const response = await fetch(
          `http://127.0.0.1:${actualPort}/screenshot`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }
        );

        expect(response.status).toBe(200);
      } finally {
        await serverWithoutEmitter.stop();
      }
    });
  });

  describe('handler without extra methods', () => {
    it('should work with minimal handler', async () => {
      const limitedHandler = {
        handleScreenshot: vi.fn(),
      };

      const serverWithLimitedHandler = createHttpServer(0, limitedHandler);
      await serverWithLimitedHandler.start();

      try {
        const requestBody = {
          buildId: 'test-build',
          name: 'test-screenshot',
          image: 'base64-image-data',
        };

        const handlerResponse = {
          statusCode: 200,
          body: { success: true },
        };

        limitedHandler.handleScreenshot.mockResolvedValue(handlerResponse);

        const actualPort = serverWithLimitedHandler.getServer().address().port;
        const response = await fetch(
          `http://127.0.0.1:${actualPort}/screenshot`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }
        );

        expect(response.status).toBe(200);
        expect(limitedHandler.handleScreenshot).toHaveBeenCalled();
      } finally {
        await serverWithLimitedHandler.stop();
      }
    });
  });
});
