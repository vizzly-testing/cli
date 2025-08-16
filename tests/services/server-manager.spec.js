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

// Mock BaseService to avoid complex inheritance issues in tests
vi.mock('../../src/services/base-service.js', () => ({
  BaseService: class MockBaseService {
    constructor(config, options = {}) {
      this.config = config;
      this.logger = options.logger || {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      this.started = false;
    }

    async start() {
      if (this.started) {
        this.logger.warn(`${this.constructor.name} already started`);
        return;
      }
      await this.onStart();
      this.started = true;
    }

    async stop() {
      if (this.started) {
        await this.onStop();
        this.started = false;
      }
    }

    async onStart() {
      // Override in child classes
    }

    async onStop() {
      // Override in child classes
    }
  },
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
      getServer: vi.fn(),
    };

    mockTddHandler = {
      initialize: vi.fn(),
      registerBuild: vi.fn(),
      handleScreenshot: vi.fn(),
      getScreenshotCount: vi.fn(),
      finishBuild: vi.fn(),
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
    ApiService.mockImplementation(() => mockApiService);

    serverManager = new ServerManager(mockConfig, mockLogger);

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
      expect(serverManager.emitter).toBe(null);
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
        'comparison-456'
      );
      expect(mockTddHandler.initialize).toHaveBeenCalled();
      expect(mockTddHandler.registerBuild).not.toHaveBeenCalled();
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
      expect(mockTddHandler.registerBuild).toHaveBeenCalledWith('build-123');
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
      const serverManagerWithoutKey = new ServerManager(
        configWithoutApiKey,
        mockLogger
      );

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

      const serverManagerWithoutPort = new ServerManager(
        configWithoutPort,
        mockLogger
      );

      const { createHttpServer } = await import(
        '../../src/server/http-server.js'
      );

      mockHttpServer.start.mockResolvedValue();
      await serverManagerWithoutPort.start(null, false);

      expect(createHttpServer).toHaveBeenCalledWith(
        47392, // default port
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use custom port when specified', async () => {
      const customConfig = {
        ...mockConfig,
        server: { port: 8080 },
      };

      const serverManagerWithCustomPort = new ServerManager(
        customConfig,
        mockLogger
      );

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

    it('should prevent multiple starts', async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();

      await serverManager.start('build-123', true);

      // Second start should warn and return early
      await serverManager.start('build-456', true);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'ServerManager already started'
      );
      expect(mockHttpServer.start).toHaveBeenCalledTimes(1);
    });

    it('should handle stop without start', async () => {
      await serverManager.onStop();

      expect(mockHttpServer.stop).not.toHaveBeenCalled();
    });

    it('should handle cleanup when handler is null', async () => {
      serverManager.handler = null;

      await serverManager.onStop();

      // Should not throw
    });
  });

  describe('server interface compatibility', () => {
    beforeEach(async () => {
      mockTddHandler.initialize.mockResolvedValue();
      mockHttpServer.start.mockResolvedValue();
      await serverManager.start('build-123', true);
    });

    it('should expose emitter through server interface', () => {
      const server = serverManager.server;
      expect(server.emitter).toBeDefined();
    });

    it('should expose getScreenshotCount through server interface', () => {
      mockTddHandler.getScreenshotCount.mockReturnValue(5);

      const server = serverManager.server;
      const count = server.getScreenshotCount('build-123');

      expect(count).toBe(5);
      expect(mockTddHandler.getScreenshotCount).toHaveBeenCalledWith(
        'build-123'
      );
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

      const newServerManager = new ServerManager(mockConfig, mockLogger);
      handlerWithoutCount.initialize.mockResolvedValue();
      await newServerManager.start('build-123', true);

      const server = newServerManager.server;
      const count = server.getScreenshotCount('build-123');

      expect(count).toBe(0);
    });

    it('should expose finishBuild through server interface', async () => {
      const mockResult = { id: 'build-123', passed: true };
      mockTddHandler.finishBuild.mockResolvedValue(mockResult);

      const server = serverManager.server;
      const result = await server.finishBuild('build-123');

      expect(result).toEqual(mockResult);
      expect(mockTddHandler.finishBuild).toHaveBeenCalledWith('build-123');
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

      const newServerManager = new ServerManager(mockConfig, mockLogger);
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
      const serverManagerWithoutKey = new ServerManager(
        configWithoutKey,
        mockLogger
      );

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

      await expect(serverManager.onStop()).rejects.toThrow('Stop failed');
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
      await expect(serverManager.onStop()).resolves.toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined config gracefully', () => {
      const serverManagerWithUndefinedConfig = new ServerManager(
        undefined,
        mockLogger
      );

      expect(serverManagerWithUndefinedConfig.config).toBeUndefined();
    });

    it('should work without baseline configuration', async () => {
      const configWithoutBaseline = {
        server: { port: 47392 },
        apiKey: 'test-api-key',
      };

      const serverManagerWithoutBaseline = new ServerManager(
        configWithoutBaseline,
        mockLogger
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
        undefined
      );
    });
  });
});
