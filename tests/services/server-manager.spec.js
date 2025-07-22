import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerManager } from '../../src/services/server-manager.js';

// Mock dependencies
vi.mock('../../src/services/base-service.js', () => ({
  BaseService: class {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
    }
  },
}));

vi.mock('../../src/server/index.js', () => ({
  VizzlyServer: vi.fn(),
}));

describe('ServerManager', () => {
  let serverManager;
  let mockConfig;
  let mockLogger;
  let mockVizzlyServer;

  beforeEach(async () => {
    mockConfig = {
      port: 3000,
      host: 'localhost',
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Mock VizzlyServer instance
    mockVizzlyServer = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    // Mock VizzlyServer constructor
    const { VizzlyServer } = await import('../../src/server/index.js');
    VizzlyServer.mockImplementation(() => mockVizzlyServer);

    serverManager = new ServerManager(mockConfig, mockLogger);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with config and logger', () => {
      expect(serverManager.config).toBe(mockConfig);
      expect(serverManager.logger).toBe(mockLogger);
      expect(serverManager.server).toBe(null);
    });
  });

  describe('onStart', () => {
    it('creates and starts VizzlyServer', async () => {
      const { VizzlyServer } = await import('../../src/server/index.js');
      mockVizzlyServer.start.mockResolvedValue();

      await serverManager.onStart();

      expect(VizzlyServer).toHaveBeenCalledWith(mockConfig);
      expect(mockVizzlyServer.start).toHaveBeenCalled();
      expect(serverManager.server).toBe(mockVizzlyServer);
    });

    it('handles server start failure', async () => {
      const startError = new Error('Failed to bind to port');
      mockVizzlyServer.start.mockRejectedValue(startError);

      await expect(serverManager.onStart()).rejects.toThrow(
        'Failed to bind to port'
      );
    });

    it('passes configuration to VizzlyServer correctly', async () => {
      const { VizzlyServer } = await import('../../src/server/index.js');
      const customConfig = {
        port: 8080,
        host: '0.0.0.0',
        tddMode: true,
        workingDir: '/custom/path',
      };

      const customServerManager = new ServerManager(customConfig, mockLogger);
      mockVizzlyServer.start.mockResolvedValue();

      await customServerManager.onStart();

      expect(VizzlyServer).toHaveBeenCalledWith(customConfig);
    });
  });

  describe('onStop', () => {
    it('stops server when server exists', async () => {
      mockVizzlyServer.stop.mockResolvedValue();

      // First start the server
      await serverManager.onStart();

      // Then stop it
      await serverManager.onStop();

      expect(mockVizzlyServer.stop).toHaveBeenCalled();
    });

    it('handles case when no server exists', async () => {
      serverManager.server = null;

      await serverManager.onStop();

      expect(mockVizzlyServer.stop).not.toHaveBeenCalled();
    });

    it('handles server stop failure', async () => {
      const stopError = new Error('Server stop failed');
      mockVizzlyServer.stop.mockRejectedValue(stopError);

      await serverManager.onStart();

      await expect(serverManager.onStop()).rejects.toThrow(
        'Server stop failed'
      );
    });

    it('can be called multiple times safely', async () => {
      mockVizzlyServer.stop.mockResolvedValue();

      await serverManager.onStart();
      await serverManager.onStop();

      // Second stop should not fail
      serverManager.server = null;
      await serverManager.onStop();

      expect(mockVizzlyServer.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('server lifecycle integration', () => {
    it('handles complete start-stop cycle', async () => {
      mockVizzlyServer.start.mockResolvedValue();
      mockVizzlyServer.stop.mockResolvedValue();

      // Verify initial state
      expect(serverManager.server).toBe(null);

      // Start server
      await serverManager.onStart();
      expect(serverManager.server).toBe(mockVizzlyServer);
      expect(mockVizzlyServer.start).toHaveBeenCalledTimes(1);

      // Stop server
      await serverManager.onStop();
      expect(mockVizzlyServer.stop).toHaveBeenCalledTimes(1);
    });

    it('handles multiple start-stop cycles', async () => {
      mockVizzlyServer.start.mockResolvedValue();
      mockVizzlyServer.stop.mockResolvedValue();

      // First cycle
      await serverManager.onStart();
      await serverManager.onStop();

      // Second cycle - should create new server instance
      await serverManager.onStart();
      await serverManager.onStop();

      expect(mockVizzlyServer.start).toHaveBeenCalledTimes(2);
      expect(mockVizzlyServer.stop).toHaveBeenCalledTimes(2);
    });

    it('maintains server reference during lifecycle', async () => {
      mockVizzlyServer.start.mockResolvedValue();

      expect(serverManager.server).toBe(null);

      await serverManager.onStart();
      expect(serverManager.server).toBe(mockVizzlyServer);
      expect(serverManager.server).not.toBe(null);
    });
  });

  describe('error handling', () => {
    it('propagates VizzlyServer constructor errors', async () => {
      const { VizzlyServer } = await import('../../src/server/index.js');
      const constructorError = new Error('Invalid configuration');
      VizzlyServer.mockImplementation(() => {
        throw constructorError;
      });

      await expect(serverManager.onStart()).rejects.toThrow(
        'Invalid configuration'
      );
    });

    it('handles async start errors gracefully', async () => {
      const asyncError = new Error('Async start failure');
      mockVizzlyServer.start.mockRejectedValue(asyncError);

      await expect(serverManager.onStart()).rejects.toThrow(
        'Async start failure'
      );

      // Server reference should still be set even if start fails
      expect(serverManager.server).toBe(mockVizzlyServer);
    });

    it('handles async stop errors gracefully', async () => {
      mockVizzlyServer.start.mockResolvedValue();
      mockVizzlyServer.stop.mockRejectedValue(new Error('Stop failed'));

      await serverManager.onStart();

      await expect(serverManager.onStop()).rejects.toThrow('Stop failed');
    });
  });

  describe('configuration variations', () => {
    it('handles minimal configuration', async () => {
      const { VizzlyServer } = await import('../../src/server/index.js');
      const minimalConfig = {};
      const minimalServerManager = new ServerManager(minimalConfig, mockLogger);

      mockVizzlyServer.start.mockResolvedValue();

      await minimalServerManager.onStart();

      expect(VizzlyServer).toHaveBeenCalledWith(minimalConfig);
    });

    it('handles rich configuration with all options', async () => {
      const { VizzlyServer } = await import('../../src/server/index.js');
      const richConfig = {
        port: 8080,
        host: '0.0.0.0',
        tddMode: true,
        baselineBuild: 'build123',
        baselineComparison: 'comp456',
        workingDir: '/app/workspace',
        buildId: 'current-build',
        buildInfo: { name: 'Test Build' },
        vizzlyApi: { key: 'api-key' },
      };

      const richServerManager = new ServerManager(richConfig, mockLogger);
      mockVizzlyServer.start.mockResolvedValue();

      await richServerManager.onStart();

      expect(VizzlyServer).toHaveBeenCalledWith(richConfig);
    });
  });

  describe('edge cases', () => {
    it('handles undefined config gracefully', async () => {
      const { VizzlyServer } = await import('../../src/server/index.js');
      const serverManagerWithUndefinedConfig = new ServerManager(
        undefined,
        mockLogger
      );

      mockVizzlyServer.start.mockResolvedValue();

      await serverManagerWithUndefinedConfig.onStart();

      expect(VizzlyServer).toHaveBeenCalledWith(undefined);
    });

    it('handles null logger gracefully', () => {
      const serverManagerWithNullLogger = new ServerManager(mockConfig, null);

      expect(serverManagerWithNullLogger.config).toBe(mockConfig);
      expect(serverManagerWithNullLogger.logger).toBe(null);
    });

    it('server reference is properly managed', async () => {
      mockVizzlyServer.start.mockResolvedValue();

      // Initially null
      expect(serverManager.server).toBe(null);

      // Set during onStart
      await serverManager.onStart();
      const serverRef = serverManager.server;
      expect(serverRef).toBe(mockVizzlyServer);

      // Reference persists after start
      expect(serverManager.server).toBe(serverRef);
    });
  });
});
