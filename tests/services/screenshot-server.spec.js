import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenshotServer } from '../../src/services/screenshot-server.js';

// Mock dependencies
vi.mock('http', () => ({
  createServer: vi.fn(),
}));

vi.mock('../../src/services/base-service.js', () => ({
  BaseService: class {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
    }
  },
}));

vi.mock('../../src/errors/vizzly-error.js', () => ({
  VizzlyError: class extends Error {
    constructor(message, code = 'VIZZLY_ERROR') {
      super(message);
      this.name = 'VizzlyError';
      this.code = code;
    }
  },
}));

describe('ScreenshotServer', () => {
  let screenshotServer;
  let mockConfig;
  let mockLogger;
  let mockBuildManager;
  let mockServer;
  let mockRequest;
  let mockResponse;

  beforeEach(async () => {
    mockConfig = {
      server: {
        port: 3001,
      },
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockBuildManager = {
      addScreenshot: vi.fn(),
    };

    // Mock HTTP server
    mockServer = {
      listen: vi.fn(),
      close: vi.fn(),
    };

    // Mock HTTP request/response
    mockRequest = {
      method: 'POST',
      url: '/screenshot',
      on: vi.fn(),
    };

    mockResponse = {
      statusCode: 200,
      end: vi.fn(),
      setHeader: vi.fn(),
    };

    const { createServer } = await import('http');
    createServer.mockReturnValue(mockServer);

    screenshotServer = new ScreenshotServer(
      mockConfig,
      mockLogger,
      mockBuildManager
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with correct dependencies', () => {
      expect(screenshotServer.config).toBe(mockConfig);
      expect(screenshotServer.logger).toBe(mockLogger);
      expect(screenshotServer.buildManager).toBe(mockBuildManager);
      expect(screenshotServer.server).toBe(null);
    });
  });

  describe('onStart', () => {
    it('starts server successfully', async () => {
      mockServer.listen.mockImplementation((port, host, callback) => {
        callback(null); // Success
      });

      await screenshotServer.onStart();

      expect(mockServer.listen).toHaveBeenCalledWith(
        3001,
        '127.0.0.1',
        expect.any(Function)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Screenshot server listening on http://127.0.0.1:3001'
      );
      expect(screenshotServer.server).toBe(mockServer);
    });

    it('handles server start failure', async () => {
      const error = new Error('Port already in use');
      mockServer.listen.mockImplementation((port, host, callback) => {
        callback(error);
      });

      await expect(screenshotServer.onStart()).rejects.toThrow(
        'Failed to start screenshot server: Port already in use'
      );
    });

    it('creates server with correct request handler', async () => {
      const { createServer } = await import('http');
      mockServer.listen.mockImplementation((port, host, callback) => {
        callback(null);
      });

      await screenshotServer.onStart();

      expect(createServer).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('onStop', () => {
    it('stops server successfully', async () => {
      screenshotServer.server = mockServer;
      mockServer.close.mockImplementation(callback => {
        callback();
      });

      await screenshotServer.onStop();

      expect(mockServer.close).toHaveBeenCalledWith(expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith('Screenshot server stopped');
    });

    it('handles case when no server is running', async () => {
      screenshotServer.server = null;

      const result = await screenshotServer.onStop();

      expect(result).toBeUndefined();
      expect(mockServer.close).not.toHaveBeenCalled();
    });
  });

  describe('handleRequest', () => {
    it('processes valid screenshot request', async () => {
      const mockBody = {
        buildId: 'build123',
        name: 'test-screenshot',
        image: 'base64-image-data',
        properties: { viewport: '1920x1080' },
      };

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify(mockBody));
        } else if (event === 'end') {
          callback();
        }
      });

      mockBuildManager.addScreenshot.mockResolvedValue();

      await screenshotServer.handleRequest(mockRequest, mockResponse);

      expect(mockBuildManager.addScreenshot).toHaveBeenCalledWith('build123', {
        name: 'test-screenshot',
        image: 'base64-image-data',
        properties: { viewport: '1920x1080' },
      });

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ success: true })
      );
    });

    it('returns 400 for missing required fields', async () => {
      const mockBody = {
        buildId: 'build123',
        // Missing name and image
      };

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify(mockBody));
        } else if (event === 'end') {
          callback();
        }
      });

      await screenshotServer.handleRequest(mockRequest, mockResponse);

      expect(mockResponse.statusCode).toBe(400);
      expect(mockResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'name and image are required' })
      );
      expect(mockBuildManager.addScreenshot).not.toHaveBeenCalled();
    });

    it('handles buildManager errors', async () => {
      const mockBody = {
        buildId: 'build123',
        name: 'test-screenshot',
        image: 'base64-data',
      };

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify(mockBody));
        } else if (event === 'end') {
          callback();
        }
      });

      mockBuildManager.addScreenshot.mockRejectedValue(
        new Error('Build not found')
      );

      await screenshotServer.handleRequest(mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process screenshot:',
        expect.any(Error)
      );
      expect(mockResponse.statusCode).toBe(500);
      expect(mockResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Internal server error' })
      );
    });

    it('returns 404 for non-screenshot endpoints', async () => {
      mockRequest.url = '/health';

      await screenshotServer.handleRequest(mockRequest, mockResponse);

      expect(mockResponse.statusCode).toBe(404);
      expect(mockResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Not found' })
      );
    });

    it('returns 404 for non-POST requests', async () => {
      mockRequest.method = 'GET';
      mockRequest.url = '/screenshot';

      await screenshotServer.handleRequest(mockRequest, mockResponse);

      expect(mockResponse.statusCode).toBe(404);
      expect(mockResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Not found' })
      );
    });

    it('handles request parsing errors', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback('invalid-json');
        } else if (event === 'end') {
          callback();
        }
      });

      await screenshotServer.handleRequest(mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockResponse.statusCode).toBe(500);
      expect(mockResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Internal server error' })
      );
    });
  });

  describe('parseRequestBody', () => {
    it('parses valid JSON successfully', async () => {
      const mockData = { test: 'data', number: 42 };

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback(JSON.stringify(mockData));
        } else if (event === 'end') {
          callback();
        }
      });

      const result = await screenshotServer.parseRequestBody(mockRequest);
      expect(result).toEqual(mockData);
    });

    it('handles chunked data correctly', async () => {
      const mockData = { large: 'data'.repeat(100) };
      const jsonString = JSON.stringify(mockData);
      const chunk1 = jsonString.slice(0, 50);
      const chunk2 = jsonString.slice(50);

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          // Simulate receiving multiple chunks
          setTimeout(() => callback(chunk1), 0);
          setTimeout(() => callback(chunk2), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
      });

      const result = await screenshotServer.parseRequestBody(mockRequest);
      expect(result).toEqual(mockData);
    });

    it('throws error for invalid JSON', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          callback('{ invalid json }');
        } else if (event === 'end') {
          callback();
        }
      });

      await expect(
        screenshotServer.parseRequestBody(mockRequest)
      ).rejects.toThrow('Invalid JSON in request body');
    });

    it('handles request errors', async () => {
      const requestError = new Error('Connection reset');

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(requestError);
        }
      });

      await expect(
        screenshotServer.parseRequestBody(mockRequest)
      ).rejects.toThrow('Request error: Connection reset');
    });

    it('handles empty request body', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          // No data chunks
        } else if (event === 'end') {
          callback();
        }
      });

      await expect(
        screenshotServer.parseRequestBody(mockRequest)
      ).rejects.toThrow('Invalid JSON in request body');
    });
  });

  describe('integration scenarios', () => {
    it('handles complete server lifecycle', async () => {
      mockServer.listen.mockImplementation((port, host, callback) => {
        callback(null);
      });
      mockServer.close.mockImplementation(callback => {
        callback();
      });

      // Start server
      await screenshotServer.onStart();
      expect(screenshotServer.server).toBe(mockServer);

      // Stop server
      await screenshotServer.onStop();
      expect(mockLogger.info).toHaveBeenCalledWith('Screenshot server stopped');
    });

    it('processes multiple screenshot requests correctly', async () => {
      const screenshots = [
        { buildId: 'build1', name: 'test1', image: 'data1' },
        { buildId: 'build2', name: 'test2', image: 'data2' },
      ];

      for (const screenshot of screenshots) {
        mockRequest.on.mockImplementation((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify(screenshot));
          } else if (event === 'end') {
            callback();
          }
        });

        await screenshotServer.handleRequest(mockRequest, mockResponse);
      }

      expect(mockBuildManager.addScreenshot).toHaveBeenCalledTimes(2);
      expect(mockBuildManager.addScreenshot).toHaveBeenCalledWith('build1', {
        name: 'test1',
        image: 'data1',
      });
      expect(mockBuildManager.addScreenshot).toHaveBeenCalledWith('build2', {
        name: 'test2',
        image: 'data2',
      });
    });
  });
});
