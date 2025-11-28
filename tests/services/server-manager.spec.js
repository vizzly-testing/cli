import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerManager } from '../../src/services/server-manager.js';

// Mock dependencies
vi.mock('../../src/server/http-server.js', () => ({
  createHttpServer: vi.fn(),
}));

vi.mock('../../src/server/handlers/tdd-handler.js', () => ({
  createTddHandler: vi.fn(),
}));

vi.mock('../../src/server/handlers/api-handler.js', () => ({
  createApiHandler: vi.fn(),
}));

vi.mock('../../src/services/api-service.js', () => ({
  ApiService: vi.fn(),
}));

vi.mock('events', () => ({
  EventEmitter: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    once: vi.fn(),
  })),
}));

describe('ServerManager', () => {
  let serverManager;
  let mockConfig;
  let mockLogger;
  let mockHttpServer;
  let mockTddHandler;
  let mockApiHandler;
  let mockApiService;

  beforeEach(async () => {
    mockConfig = {
      server: { port: 47392 },
      apiKey: 'test-api-key',
      baselineBuildId: 'baseline-123',
      baselineComparisonId: 'comparison-456',
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockHttpServer = {
      start: vi.fn(),
      stop: vi.fn(),
      finishBuild: vi.fn(),
      getServer: vi.fn(),
    };

    mockTddHandler = {
      initialize: vi.fn(),
      registerBuild: vi.fn(),
      handleScreenshot: vi.fn(),
      getScreenshotCount: vi.fn(),
      cleanup: vi.fn(),
    };

    mockApiHandler = {
      handleScreenshot: vi.fn(),
      getScreenshotCount: vi.fn(),
      cleanup: vi.fn(),
    };

    mockApiService = {
      uploadScreenshot: vi.fn(),
    };

    // Mock implementations
    const { createHttpServer } = await import(
      '../../src/server/http-server.js'
    );
    const { createTddHandler } = await import(
      '../../src/server/handlers/tdd-handler.js'
    );
    const { createApiHandler } = await import(
      '../../src/server/handlers/api-handler.js'
    );
    const { ApiService } = await import('../../src/services/api-service.js');

    createHttpServer.mockReturnValue(mockHttpServer);
    createTddHandler.mockReturnValue(mockTddHandler);
    createApiHandler.mockReturnValue(mockApiHandler);
    ApiService.mockImplementation(function () {
      return mockApiService;
    });

    serverManager = new ServerManager(mockConfig, { logger: mockLogger });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config and logger', () => {
      expect(serverManager.config).toBe(mockConfig);
      expect(serverManager.logger).toBe(mockLogger);
      expect(serverManager.httpServer).toBe(null);
      expect(serverManager.handler).toBe(null);
    });
  });

  describe('TDD mode', () => {
    it('should start in TDD mode without buildId', async () => {
      const { createTddHandler } = await import(
        '../../src/server/handlers/tdd-handler.js'
      );
      const { createHttpServer } = await import(
        '../../src/server/http-server.js'
      );

      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();

      await serverManager.start(null, true);

      expect(createTddHandler).toHaveBeenCalledWith(
        mockConfig,
        process.cwd(),
        'baseline-123',
        'comparison-456',
        false
      );
      expect(mockTddHandler.initialize).toHaveBeenCalled();
      expect(createHttpServer).toHaveBeenCalledWith(
        47392,
        mockTddHandler,
        expect.any(Object)
      );
      expect(mockHttpServer.start).toHaveBeenCalled();
    });

    it('should start in TDD mode with buildId', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();

      await serverManager.start('build-123', true);

      expect(mockTddHandler.initialize).toHaveBeenCalled();
    });

    it('should handle TDD initialization failure', async () => {
      const initError = new Error('TDD initialization failed');
      mockTddHandler.initialize.mockRejectedValue(initError);

      await expect(serverManager.start(null, true)).rejects.toThrow(
        'TDD initialization failed'
      );
    });
  });

  describe('API mode', () => {
    it('should start in API mode', async () => {
      const { createApiHandler } = await import(
        '../../src/server/handlers/api-handler.js'
      );
      const { createHttpServer } = await import(
        '../../src/server/http-server.js'
      );

      mockHttpServer.start.mockResolvedValue();

      await serverManager.start('build-123', false);

      expect(createApiHandler).toHaveBeenCalledWith(mockApiService);
      expect(createHttpServer).toHaveBeenCalledWith(
        47392,
        mockApiHandler,
        expect.any(Object)
      );
      expect(mockHttpServer.start).toHaveBeenCalled();
    });

    it('should handle API mode without API key', async () => {
      const configWithoutApiKey = { ...mockConfig, apiKey: null };
      const serverManagerWithoutKey = new ServerManager(configWithoutApiKey, {
        logger: mockLogger,
      });

      const { createApiHandler } = await import(
        '../../src/server/handlers/api-handler.js'
      );

      mockHttpServer.start.mockResolvedValue();

      await serverManagerWithoutKey.start('build-123', false);

      expect(createApiHandler).toHaveBeenCalledWith(null);
    });
  });

  describe('configuration handling', () => {
    it('should use default port when not specified', async () => {
      const configWithoutPort = { ...mockConfig };
      delete configWithoutPort.server;

      const serverManagerWithoutPort = new ServerManager(configWithoutPort, {
        logger: mockLogger,
      });

      const { createHttpServer } = await import(
        '../../src/server/http-server.js'
      );

      mockHttpServer.start.mockResolvedValue();
      await serverManagerWithoutPort.start(null, false);

      expect(createHttpServer).toHaveBeenCalledWith(
        47392,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use custom port when specified', async () => {
      const customConfig = {
        ...mockConfig,
        server: { port: 8080 },
      };

      const serverManagerWithCustomPort = new ServerManager(customConfig, {
        logger: mockLogger,
      });

      const { createHttpServer } = await import(
        '../../src/server/http-server.js'
      );

      mockHttpServer.start.mockResolvedValue();
      await serverManagerWithCustomPort.start(null, false);

      expect(createHttpServer).toHaveBeenCalledWith(
        8080,
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('server lifecycle', () => {
    it('should handle complete start-stop cycle in TDD mode', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();
      mockHttpServer.stop.mockResolvedValue();

      await serverManager.start('build-123', true);
      await serverManager.stop();

      expect(mockHttpServer.start).toHaveBeenCalledTimes(1);
      expect(mockHttpServer.stop).toHaveBeenCalledTimes(1);
      expect(mockTddHandler.cleanup).toHaveBeenCalledTimes(1);
    });

    it('should handle complete start-stop cycle in API mode', async () => {
      mockHttpServer.start.mockResolvedValue();
      mockHttpServer.stop.mockResolvedValue();

      await serverManager.start('build-123', false);
      await serverManager.stop();

      expect(mockHttpServer.start).toHaveBeenCalledTimes(1);
      expect(mockHttpServer.stop).toHaveBeenCalledTimes(1);
      expect(mockApiHandler.cleanup).toHaveBeenCalledTimes(1);
    });

    it('should allow multiple starts (overwrites previous state)', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();

      await serverManager.start('build-123', true);

      // Second start creates a new server instance
      await serverManager.start('build-456', true);

      expect(mockHttpServer.start).toHaveBeenCalledTimes(2);
    });

    it('should handle stop without start', async () => {
      await serverManager.stop();

      expect(mockHttpServer.stop).not.toHaveBeenCalled();
    });

    it('should handle cleanup when handler is null', async () => {
      serverManager.handler = null;

      await serverManager.stop();

      // Should not throw
    });
  });

  describe('server interface compatibility', () => {
    beforeEach(async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();
      await serverManager.start('build-123', true);
    });

    it('should handle getScreenshotCount when handler lacks method', async () => {
      const handlerWithoutCount = {
        initialize: vi.fn(),
        registerBuild: vi.fn(),
        cleanup: vi.fn(),
      };

      const { createTddHandler } = await import(
        '../../src/server/handlers/tdd-handler.js'
      );
      createTddHandler.mockReturnValue(handlerWithoutCount);

      const newServerManager = new ServerManager(mockConfig, {
        logger: mockLogger,
      });
      handlerWithoutCount.initialize.mockResolvedValue();
      await newServerManager.start('build-123', true);

      const server = newServerManager.server;
      const count = server.getScreenshotCount('build-123');

      expect(count).toBe(0);
    });

    it('should expose finishBuild through server interface', async () => {
      const mockResult = { id: 'build-123', passed: true };
      mockHttpServer.finishBuild.mockResolvedValue(mockResult);

      const server = serverManager.server;
      const result = await server.finishBuild('build-123');

      expect(result).toEqual(mockResult);
      expect(mockHttpServer.finishBuild).toHaveBeenCalledWith('build-123');
    });

    it('should handle finishBuild when handler lacks method', async () => {
      const handlerWithoutFinish = {
        initialize: vi.fn(),
        registerBuild: vi.fn(),
        cleanup: vi.fn(),
      };

      const { createTddHandler } = await import(
        '../../src/server/handlers/tdd-handler.js'
      );
      createTddHandler.mockReturnValue(handlerWithoutFinish);

      const newServerManager = new ServerManager(mockConfig, {
        logger: mockLogger,
      });
      handlerWithoutFinish.initialize.mockResolvedValue();
      await newServerManager.start('build-123', true);

      const server = newServerManager.server;
      const result = await server.finishBuild('build-123');

      expect(result).toBeUndefined();
    });
  });

  describe('createApiService', () => {
    it('should create API service with correct configuration', async () => {
      const { ApiService } = await import('../../src/services/api-service.js');

      const apiService = await serverManager.createApiService();

      expect(ApiService).toHaveBeenCalledWith(
        { ...mockConfig, command: 'run' },
        { logger: mockLogger }
      );
      expect(apiService).toBe(mockApiService);
    });

    it('should return null when no API key', async () => {
      const configWithoutKey = { ...mockConfig, apiKey: null };
      const serverManagerWithoutKey = new ServerManager(configWithoutKey, {
        logger: mockLogger,
      });

      const apiService = await serverManagerWithoutKey.createApiService();

      expect(apiService).toBe(null);
    });
  });

  describe('error handling', () => {
    it('should propagate HTTP server start errors', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockRejectedValue(new Error('Port in use'));

      await expect(serverManager.start('build-123', true)).rejects.toThrow(
        'Port in use'
      );
    });

    it('should propagate HTTP server stop errors', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();
      mockHttpServer.stop.mockRejectedValue(new Error('Stop failed'));

      await serverManager.start('build-123', true);

      await expect(serverManager.stop()).rejects.toThrow('Stop failed');
    });

    it('should handle handler cleanup errors gracefully', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockTddHandler.cleanup.mockImplementation(() => {
        throw new Error('Cleanup error');
      });
      mockHttpServer.start.mockResolvedValue();
      mockHttpServer.stop.mockResolvedValue();

      await serverManager.start('build-123', true);

      // Should not throw despite cleanup error
      await expect(serverManager.stop()).resolves.toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined config gracefully', () => {
      const serverManagerWithUndefinedConfig = new ServerManager(undefined, {
        logger: mockLogger,
      });

      expect(serverManagerWithUndefinedConfig.config).toBeUndefined();
    });

    it('should work without baseline configuration', async () => {
      const configWithoutBaseline = {
        server: { port: 47392 },
        apiKey: 'test-api-key',
      };

      const serverManagerWithoutBaseline = new ServerManager(
        configWithoutBaseline,
        { logger: mockLogger }
      );

      const { createTddHandler } = await import(
        '../../src/server/handlers/tdd-handler.js'
      );

      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();

      await serverManagerWithoutBaseline.start('build-123', true);

      expect(createTddHandler).toHaveBeenCalledWith(
        configWithoutBaseline,
        process.cwd(),
        undefined,
        undefined,
        false
      );
    });
  });
});
