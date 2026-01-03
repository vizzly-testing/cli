import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildServerInterface } from '../../src/server-manager/core.js';
import { createServerManager } from '../../src/server-manager/index.js';
import {
  getTddResults,
  startServer,
  stopServer,
} from '../../src/server-manager/operations.js';

describe('server-manager/index', () => {
  describe('createServerManager', () => {
    it('creates manager with start, stop, getTddResults, and server', () => {
      let manager = createServerManager({ server: { port: 47392 } });

      assert.ok(manager.start);
      assert.ok(manager.stop);
      assert.ok(manager.getTddResults);
      assert.ok('server' in manager);
    });

    describe('start', () => {
      it('starts TDD server when tddMode is true', async () => {
        let httpServerStarted = false;
        let tddHandlerCreated = false;
        let serverJsonWritten = false;

        let mockHandler = {
          initialize: async () => {},
          tddService: {},
        };

        let mockDeps = {
          createHttpServer: () => ({
            start: async () => {
              httpServerStarted = true;
            },
          }),
          createTddHandler: () => {
            tddHandlerCreated = true;
            return mockHandler;
          },
          createApiHandler: () => ({}),
          createApiClient: () => ({}),
          fs: {
            mkdirSync: () => {},
            writeFileSync: () => {
              serverJsonWritten = true;
            },
          },
        };

        // Inject deps by creating manager with custom startServer
        let manager = createServerManagerWithDeps(
          { server: { port: 47392 } },
          {},
          mockDeps
        );

        await manager.start('build-123', true, false);

        assert.strictEqual(httpServerStarted, true);
        assert.strictEqual(tddHandlerCreated, true);
        assert.strictEqual(serverJsonWritten, true);
      });

      it('starts API server when tddMode is false with apiKey', async () => {
        let apiHandlerCreated = false;

        let mockDeps = {
          createHttpServer: () => ({
            start: async () => {},
          }),
          createTddHandler: () => ({
            initialize: async () => {},
          }),
          createApiHandler: () => {
            apiHandlerCreated = true;
            return {};
          },
          createApiClient: () => ({}),
          fs: {
            mkdirSync: () => {},
            writeFileSync: () => {},
          },
        };

        let manager = createServerManagerWithDeps(
          { server: { port: 47392 }, apiKey: 'test-key' },
          {},
          mockDeps
        );

        await manager.start('build-123', false, false);

        assert.strictEqual(apiHandlerCreated, true);
      });
    });

    describe('stop', () => {
      it('stops http server and cleans up handler', async () => {
        let httpServerStopped = false;
        let handlerCleaned = false;
        let serverJsonRemoved = false;

        let mockHandler = {
          initialize: async () => {},
          tddService: {},
          cleanup: () => {
            handlerCleaned = true;
          },
        };

        let mockDeps = {
          createHttpServer: () => ({
            start: async () => {},
            stop: async () => {
              httpServerStopped = true;
            },
          }),
          createTddHandler: () => mockHandler,
          createApiHandler: () => ({}),
          createApiClient: () => ({}),
          fs: {
            mkdirSync: () => {},
            writeFileSync: () => {},
            existsSync: () => true,
            unlinkSync: () => {
              serverJsonRemoved = true;
            },
          },
        };

        let manager = createServerManagerWithDeps(
          { server: { port: 47392 } },
          {},
          mockDeps
        );

        await manager.start('build-123', true, false);
        await manager.stop();

        assert.strictEqual(httpServerStopped, true);
        assert.strictEqual(handlerCleaned, true);
        assert.strictEqual(serverJsonRemoved, true);
      });

      it('handles stop before start gracefully', async () => {
        let mockDeps = {
          createHttpServer: () => ({}),
          createTddHandler: () => ({}),
          createApiHandler: () => ({}),
          createApiClient: () => ({}),
          fs: {
            mkdirSync: () => {},
            writeFileSync: () => {},
            existsSync: () => false,
            unlinkSync: () => {},
          },
        };

        let manager = createServerManagerWithDeps(
          { server: { port: 47392 } },
          {},
          mockDeps
        );

        // Should not throw
        await manager.stop();
      });
    });

    describe('getTddResults', () => {
      it('returns results from TDD handler', async () => {
        let mockResults = { total: 10, passed: 8, failed: 2 };

        let mockHandler = {
          initialize: async () => {},
          tddService: {},
          getResults: async () => mockResults,
        };

        let mockDeps = {
          createHttpServer: () => ({
            start: async () => {},
          }),
          createTddHandler: () => mockHandler,
          createApiHandler: () => ({}),
          createApiClient: () => ({}),
          fs: {
            mkdirSync: () => {},
            writeFileSync: () => {},
          },
        };

        let manager = createServerManagerWithDeps(
          { server: { port: 47392 } },
          {},
          mockDeps
        );

        await manager.start('build-123', true, false);
        let results = await manager.getTddResults();

        assert.deepStrictEqual(results, mockResults);
      });

      it('returns null before server is started', async () => {
        let manager = createServerManager({ server: { port: 47392 } });

        let results = await manager.getTddResults();

        assert.strictEqual(results, null);
      });
    });

    describe('server getter', () => {
      it('returns server interface after start', async () => {
        let mockHandler = {
          initialize: async () => {},
          tddService: {},
          getScreenshotCount: () => 5,
        };

        let mockHttpServer = {
          start: async () => {},
          finishBuild: () => ({ id: 'finished' }),
        };

        let mockDeps = {
          createHttpServer: () => mockHttpServer,
          createTddHandler: () => mockHandler,
          createApiHandler: () => ({}),
          createApiClient: () => ({}),
          fs: {
            mkdirSync: () => {},
            writeFileSync: () => {},
          },
        };

        let manager = createServerManagerWithDeps(
          { server: { port: 47392 } },
          {},
          mockDeps
        );

        await manager.start('build-123', true, false);
        let server = manager.server;

        assert.strictEqual(server.getScreenshotCount('any'), 5);
        assert.deepStrictEqual(server.finishBuild('build-123'), {
          id: 'finished',
        });
      });

      it('returns interface with defaults before start', () => {
        let manager = createServerManager({ server: { port: 47392 } });
        let server = manager.server;

        assert.strictEqual(server.getScreenshotCount('build-123'), 0);
        assert.strictEqual(server.finishBuild('build-123'), undefined);
      });
    });
  });
});

/**
 * Helper to create a server manager with injectable dependencies.
 * This mirrors the internal structure of createServerManager but allows
 * us to inject mocks for testing.
 */
function createServerManagerWithDeps(config, services, deps) {
  let httpServer = null;
  let handler = null;

  return {
    async start(buildId, tddMode, setBaseline) {
      let result = await startServer({
        config,
        buildId,
        tddMode,
        setBaseline,
        projectRoot: process.cwd(),
        services,
        deps,
      });
      httpServer = result.httpServer;
      handler = result.handler;
    },

    async stop() {
      await stopServer({
        httpServer,
        handler,
        projectRoot: process.cwd(),
        deps,
      });
    },

    async getTddResults() {
      return getTddResults({ tddMode: true, handler });
    },

    get server() {
      return buildServerInterface({ handler, httpServer });
    },
  };
}
