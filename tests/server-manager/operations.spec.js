import { describe, expect, it, vi } from 'vitest';
import {
  getTddResults,
  removeServerJson,
  startServer,
  stopServer,
  writeServerJson,
} from '../../src/server-manager/operations.js';

// ============================================================================
// Test Helpers - Stubs and Factories
// ============================================================================

function createMockFs() {
  return {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
    unlinkSync: vi.fn(),
  };
}

function createMockHandler(overrides = {}) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    getResults: vi.fn().mockResolvedValue({ total: 5, passed: 4, failed: 1 }),
    getScreenshotCount: vi.fn().mockReturnValue(10),
    tddService: { download: vi.fn() },
    ...overrides,
  };
}

function createMockHttpServer(overrides = {}) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    finishBuild: vi.fn().mockResolvedValue({ id: 'build-123' }),
    ...overrides,
  };
}

function createMockDeps(overrides = {}) {
  let mockHandler = createMockHandler();
  let mockHttpServer = createMockHttpServer();
  let mockClient = { request: vi.fn() };

  return {
    createHttpServer: vi.fn().mockReturnValue(mockHttpServer),
    createTddHandler: vi.fn().mockReturnValue(mockHandler),
    createApiHandler: vi.fn().mockReturnValue(mockHandler),
    createApiClient: vi.fn().mockReturnValue(mockClient),
    fs: createMockFs(),
    mockHandler,
    mockHttpServer,
    mockClient,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('server-manager/operations', () => {
  describe('startServer', () => {
    describe('TDD mode', () => {
      it('creates TDD handler and starts server', async () => {
        let deps = createMockDeps();
        let config = {
          server: { port: 8080 },
          baselineBuildId: 'baseline-123',
          baselineComparisonId: 'comparison-456',
        };

        let result = await startServer({
          config,
          buildId: 'build-789',
          tddMode: true,
          setBaseline: false,
          projectRoot: '/path/to/project',
          services: { existing: true },
          deps,
        });

        expect(deps.createTddHandler).toHaveBeenCalledWith(
          config,
          '/path/to/project',
          'baseline-123',
          'comparison-456',
          false
        );
        expect(deps.mockHandler.initialize).toHaveBeenCalled();
        expect(deps.createHttpServer).toHaveBeenCalledWith(
          8080,
          deps.mockHandler,
          expect.objectContaining({
            existing: true,
            buildId: 'build-789',
            tddService: deps.mockHandler.tddService,
          })
        );
        expect(deps.mockHttpServer.start).toHaveBeenCalled();
        expect(result.httpServer).toBe(deps.mockHttpServer);
        expect(result.handler).toBe(deps.mockHandler);
        expect(result.tddMode).toBe(true);
      });

      it('passes setBaseline flag to TDD handler', async () => {
        let deps = createMockDeps();
        let config = {};

        await startServer({
          config,
          tddMode: true,
          setBaseline: true,
          projectRoot: '/project',
          deps,
        });

        expect(deps.createTddHandler).toHaveBeenCalledWith(
          config,
          '/project',
          undefined,
          undefined,
          true
        );
      });

      it('writes server.json after starting', async () => {
        let deps = createMockDeps();

        await startServer({
          config: { server: { port: 9000 } },
          buildId: 'build-abc',
          tddMode: true,
          projectRoot: '/my/project',
          deps,
        });

        expect(deps.fs.mkdirSync).toHaveBeenCalledWith('/my/project/.vizzly', {
          recursive: true,
        });
        expect(deps.fs.writeFileSync).toHaveBeenCalledWith(
          '/my/project/.vizzly/server.json',
          expect.stringContaining('"port": "9000"')
        );
        expect(deps.fs.writeFileSync).toHaveBeenCalledWith(
          '/my/project/.vizzly/server.json',
          expect.stringContaining('"buildId": "build-abc"')
        );
      });
    });

    describe('API mode', () => {
      it('creates API handler with client', async () => {
        let deps = createMockDeps();
        let config = {
          server: { port: 8080 },
          apiKey: 'test-key',
          apiUrl: 'https://api.example.com',
        };

        await startServer({
          config,
          tddMode: false,
          projectRoot: '/project',
          deps,
        });

        expect(deps.createApiClient).toHaveBeenCalledWith({
          baseUrl: 'https://api.example.com',
          token: 'test-key',
          command: 'run',
        });
        expect(deps.createApiHandler).toHaveBeenCalledWith(deps.mockClient);
        expect(deps.createTddHandler).not.toHaveBeenCalled();
      });

      it('creates API handler with null client when no apiKey', async () => {
        let deps = createMockDeps();
        let config = { apiUrl: 'https://api.example.com' };

        await startServer({
          config,
          tddMode: false,
          projectRoot: '/project',
          deps,
        });

        expect(deps.createApiClient).not.toHaveBeenCalled();
        expect(deps.createApiHandler).toHaveBeenCalledWith(null);
      });

      it('does not include tddService in services for API mode', async () => {
        let deps = createMockDeps();

        await startServer({
          config: {},
          tddMode: false,
          projectRoot: '/project',
          deps,
        });

        expect(deps.createHttpServer).toHaveBeenCalledWith(
          expect.any(Number),
          expect.any(Object),
          expect.objectContaining({ tddService: null })
        );
      });
    });

    describe('port configuration', () => {
      it('uses port from config', async () => {
        let deps = createMockDeps();
        let config = { server: { port: 3000 } };

        await startServer({
          config,
          tddMode: false,
          projectRoot: '/project',
          deps,
        });

        expect(deps.createHttpServer).toHaveBeenCalledWith(
          3000,
          expect.any(Object),
          expect.any(Object)
        );
      });

      it('uses default port when not specified', async () => {
        let deps = createMockDeps();

        await startServer({
          config: {},
          tddMode: false,
          projectRoot: '/project',
          deps,
        });

        expect(deps.createHttpServer).toHaveBeenCalledWith(
          47392,
          expect.any(Object),
          expect.any(Object)
        );
      });
    });

    describe('error handling', () => {
      it('propagates TDD handler initialization errors', async () => {
        let mockHandler = createMockHandler({
          initialize: vi.fn().mockRejectedValue(new Error('Init failed')),
        });
        let deps = createMockDeps({
          createTddHandler: vi.fn().mockReturnValue(mockHandler),
          mockHandler,
        });

        await expect(
          startServer({
            config: {},
            tddMode: true,
            projectRoot: '/project',
            deps,
          })
        ).rejects.toThrow('Init failed');
      });

      it('propagates HTTP server start errors', async () => {
        let mockHttpServer = createMockHttpServer({
          start: vi.fn().mockRejectedValue(new Error('Port in use')),
        });
        let deps = createMockDeps({
          createHttpServer: vi.fn().mockReturnValue(mockHttpServer),
          mockHttpServer,
        });

        await expect(
          startServer({
            config: {},
            tddMode: false,
            projectRoot: '/project',
            deps,
          })
        ).rejects.toThrow('Port in use');
      });

      it('does not throw when server.json write fails', async () => {
        let deps = createMockDeps();
        deps.fs.mkdirSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        // Should not throw
        await startServer({
          config: {},
          tddMode: false,
          projectRoot: '/project',
          deps,
        });
      });
    });

    describe('null http server', () => {
      it('handles null httpServer gracefully', async () => {
        let deps = createMockDeps({
          createHttpServer: vi.fn().mockReturnValue(null),
        });

        let result = await startServer({
          config: {},
          tddMode: false,
          projectRoot: '/project',
          deps,
        });

        expect(result.httpServer).toBeNull();
      });
    });
  });

  describe('stopServer', () => {
    it('stops HTTP server and calls handler cleanup', async () => {
      let mockHttpServer = createMockHttpServer();
      let mockHandler = createMockHandler();
      let deps = createMockDeps();
      deps.fs.existsSync.mockReturnValue(true);

      await stopServer({
        httpServer: mockHttpServer,
        handler: mockHandler,
        projectRoot: '/project',
        deps,
      });

      expect(mockHttpServer.stop).toHaveBeenCalled();
      expect(mockHandler.cleanup).toHaveBeenCalled();
      expect(deps.fs.unlinkSync).toHaveBeenCalledWith(
        '/project/.vizzly/server.json'
      );
    });

    it('handles null httpServer', async () => {
      let mockHandler = createMockHandler();
      let deps = createMockDeps();

      await stopServer({
        httpServer: null,
        handler: mockHandler,
        projectRoot: '/project',
        deps,
      });

      expect(mockHandler.cleanup).toHaveBeenCalled();
    });

    it('handles null handler', async () => {
      let mockHttpServer = createMockHttpServer();
      let deps = createMockDeps();

      await stopServer({
        httpServer: mockHttpServer,
        handler: null,
        projectRoot: '/project',
        deps,
      });

      expect(mockHttpServer.stop).toHaveBeenCalled();
    });

    it('handles handler without cleanup method', async () => {
      let handler = {};
      let deps = createMockDeps();

      // Should not throw
      await stopServer({
        httpServer: null,
        handler,
        projectRoot: '/project',
        deps,
      });
    });

    it('ignores cleanup errors', async () => {
      let mockHandler = createMockHandler({
        cleanup: vi.fn().mockImplementation(() => {
          throw new Error('Cleanup error');
        }),
      });
      let deps = createMockDeps();

      // Should not throw
      await stopServer({
        httpServer: null,
        handler: mockHandler,
        projectRoot: '/project',
        deps,
      });
    });

    it('propagates HTTP server stop errors', async () => {
      let mockHttpServer = createMockHttpServer({
        stop: vi.fn().mockRejectedValue(new Error('Stop failed')),
      });
      let deps = createMockDeps();

      await expect(
        stopServer({
          httpServer: mockHttpServer,
          handler: null,
          projectRoot: '/project',
          deps,
        })
      ).rejects.toThrow('Stop failed');
    });

    it('removes server.json when it exists', async () => {
      let deps = createMockDeps();
      deps.fs.existsSync.mockReturnValue(true);

      await stopServer({
        httpServer: null,
        handler: null,
        projectRoot: '/my/project',
        deps,
      });

      expect(deps.fs.existsSync).toHaveBeenCalledWith(
        '/my/project/.vizzly/server.json'
      );
      expect(deps.fs.unlinkSync).toHaveBeenCalledWith(
        '/my/project/.vizzly/server.json'
      );
    });

    it('does not unlink when server.json does not exist', async () => {
      let deps = createMockDeps();
      deps.fs.existsSync.mockReturnValue(false);

      await stopServer({
        httpServer: null,
        handler: null,
        projectRoot: '/project',
        deps,
      });

      expect(deps.fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('ignores server.json removal errors', async () => {
      let deps = createMockDeps();
      deps.fs.existsSync.mockReturnValue(true);
      deps.fs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      await stopServer({
        httpServer: null,
        handler: null,
        projectRoot: '/project',
        deps,
      });
    });
  });

  describe('writeServerJson', () => {
    it('creates directory and writes file', () => {
      let fs = createMockFs();

      writeServerJson({
        projectRoot: '/project',
        port: 8080,
        buildId: 'build-123',
        fs,
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith('/project/.vizzly', {
        recursive: true,
      });

      let writtenContent = fs.writeFileSync.mock.calls[0][1];
      let parsed = JSON.parse(writtenContent);

      expect(parsed.port).toBe('8080');
      expect(parsed.buildId).toBe('build-123');
      expect(parsed.pid).toBe(process.pid);
      expect(typeof parsed.startTime).toBe('number');
    });

    it('omits buildId when null', () => {
      let fs = createMockFs();

      writeServerJson({
        projectRoot: '/project',
        port: 8080,
        buildId: null,
        fs,
      });

      let writtenContent = fs.writeFileSync.mock.calls[0][1];
      let parsed = JSON.parse(writtenContent);

      expect(parsed).not.toHaveProperty('buildId');
    });

    it('does not throw on mkdir error', () => {
      let fs = createMockFs();
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Failed');
      });

      expect(() =>
        writeServerJson({
          projectRoot: '/project',
          port: 8080,
          fs,
        })
      ).not.toThrow();
    });

    it('does not throw on write error', () => {
      let fs = createMockFs();
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Failed');
      });

      expect(() =>
        writeServerJson({
          projectRoot: '/project',
          port: 8080,
          fs,
        })
      ).not.toThrow();
    });
  });

  describe('removeServerJson', () => {
    it('removes file when it exists', () => {
      let fs = createMockFs();
      fs.existsSync.mockReturnValue(true);

      removeServerJson({ projectRoot: '/project', fs });

      expect(fs.existsSync).toHaveBeenCalledWith(
        '/project/.vizzly/server.json'
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        '/project/.vizzly/server.json'
      );
    });

    it('does not unlink when file does not exist', () => {
      let fs = createMockFs();
      fs.existsSync.mockReturnValue(false);

      removeServerJson({ projectRoot: '/project', fs });

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('does not throw on existsSync error', () => {
      let fs = createMockFs();
      fs.existsSync.mockImplementation(() => {
        throw new Error('Failed');
      });

      expect(() =>
        removeServerJson({ projectRoot: '/project', fs })
      ).not.toThrow();
    });

    it('does not throw on unlink error', () => {
      let fs = createMockFs();
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {
        throw new Error('Failed');
      });

      expect(() =>
        removeServerJson({ projectRoot: '/project', fs })
      ).not.toThrow();
    });
  });

  describe('getTddResults', () => {
    it('returns results when in TDD mode with handler', async () => {
      let mockResults = { total: 5, passed: 4, failed: 1 };
      let handler = {
        getResults: vi.fn().mockResolvedValue(mockResults),
      };

      let results = await getTddResults({ tddMode: true, handler });

      expect(handler.getResults).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
    });

    it('returns null when not in TDD mode', async () => {
      let handler = {
        getResults: vi.fn().mockResolvedValue({ total: 5 }),
      };

      let results = await getTddResults({ tddMode: false, handler });

      expect(handler.getResults).not.toHaveBeenCalled();
      expect(results).toBeNull();
    });

    it('returns null when handler is null', async () => {
      let results = await getTddResults({ tddMode: true, handler: null });

      expect(results).toBeNull();
    });

    it('returns null when handler lacks getResults', async () => {
      let handler = {};

      let results = await getTddResults({ tddMode: true, handler });

      expect(results).toBeNull();
    });
  });
});
