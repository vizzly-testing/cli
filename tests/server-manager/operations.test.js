import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  getTddResults,
  removeServerJson,
  startServer,
  stopServer,
  writeServerJson,
} from '../../src/server-manager/operations.js';

describe('server-manager/operations', () => {
  describe('writeServerJson', () => {
    it('creates directory and writes server info', () => {
      let writtenPath = null;
      let writtenContent = null;
      let createdDir = null;

      let mockFs = {
        mkdirSync: dir => {
          createdDir = dir;
        },
        writeFileSync: (path, content) => {
          writtenPath = path;
          writtenContent = content;
        },
      };

      writeServerJson({
        projectRoot: '/project',
        port: 47392,
        buildId: 'build-123',
        fs: mockFs,
      });

      assert.ok(createdDir.includes('.vizzly'));
      assert.ok(writtenPath.includes('server.json'));
      let parsed = JSON.parse(writtenContent);
      assert.strictEqual(parsed.port, '47392'); // Port is stored as string
      assert.strictEqual(parsed.buildId, 'build-123');
      assert.ok(parsed.pid);
      assert.ok(parsed.startTime);
    });

    it('handles null buildId', () => {
      let writtenContent = null;

      let mockFs = {
        mkdirSync: () => {},
        writeFileSync: (_path, content) => {
          writtenContent = content;
        },
      };

      writeServerJson({
        projectRoot: '/project',
        port: 8080,
        buildId: null,
        fs: mockFs,
      });

      let parsed = JSON.parse(writtenContent);
      assert.strictEqual(parsed.port, '8080'); // Port is stored as string
      assert.strictEqual(parsed.buildId, undefined); // null buildId is not included
    });

    it('silently handles errors', () => {
      let mockFs = {
        mkdirSync: () => {
          throw new Error('Permission denied');
        },
        writeFileSync: () => {},
      };

      // Should not throw
      writeServerJson({
        projectRoot: '/project',
        port: 47392,
        fs: mockFs,
      });
    });
  });

  describe('removeServerJson', () => {
    it('removes server.json file when it exists', () => {
      let removedPath = null;

      let mockFs = {
        existsSync: () => true,
        unlinkSync: path => {
          removedPath = path;
        },
      };

      removeServerJson({
        projectRoot: '/project',
        fs: mockFs,
      });

      assert.ok(removedPath.includes('server.json'));
    });

    it('does nothing when file does not exist', () => {
      let unlinkCalled = false;

      let mockFs = {
        existsSync: () => false,
        unlinkSync: () => {
          unlinkCalled = true;
        },
      };

      removeServerJson({
        projectRoot: '/project',
        fs: mockFs,
      });

      assert.strictEqual(unlinkCalled, false);
    });

    it('silently handles errors', () => {
      let mockFs = {
        existsSync: () => true,
        unlinkSync: () => {
          throw new Error('Permission denied');
        },
      };

      // Should not throw
      removeServerJson({
        projectRoot: '/project',
        fs: mockFs,
      });
    });
  });

  describe('getTddResults', () => {
    it('returns null when not in TDD mode', async () => {
      let result = await getTddResults({
        tddMode: false,
        handler: { getResults: async () => ({ total: 5 }) },
      });

      assert.strictEqual(result, null);
    });

    it('returns null when handler has no getResults', async () => {
      let result = await getTddResults({
        tddMode: true,
        handler: {},
      });

      assert.strictEqual(result, null);
    });

    it('returns null when handler is null', async () => {
      let result = await getTddResults({
        tddMode: true,
        handler: null,
      });

      assert.strictEqual(result, null);
    });

    it('returns results from handler in TDD mode', async () => {
      let mockResults = { total: 10, passed: 8, failed: 2 };

      let result = await getTddResults({
        tddMode: true,
        handler: {
          getResults: async () => mockResults,
        },
      });

      assert.deepStrictEqual(result, mockResults);
    });
  });

  describe('stopServer', () => {
    it('stops http server and cleans up handler', async () => {
      let httpStopped = false;
      let handlerCleaned = false;
      let serverJsonRemoved = false;

      let mockFs = {
        existsSync: () => true,
        unlinkSync: () => {
          serverJsonRemoved = true;
        },
      };

      await stopServer({
        httpServer: {
          stop: async () => {
            httpStopped = true;
          },
        },
        handler: {
          cleanup: () => {
            handlerCleaned = true;
          },
        },
        projectRoot: '/project',
        deps: { fs: mockFs },
      });

      assert.strictEqual(httpStopped, true);
      assert.strictEqual(handlerCleaned, true);
      assert.strictEqual(serverJsonRemoved, true);
    });

    it('handles null httpServer', async () => {
      let mockFs = {
        existsSync: () => false,
        unlinkSync: () => {},
      };

      // Should not throw
      await stopServer({
        httpServer: null,
        handler: null,
        projectRoot: '/project',
        deps: { fs: mockFs },
      });
    });

    it('handles handler cleanup errors gracefully', async () => {
      let mockFs = {
        existsSync: () => false,
        unlinkSync: () => {},
      };

      // Should not throw even if cleanup throws
      await stopServer({
        httpServer: null,
        handler: {
          cleanup: () => {
            throw new Error('Cleanup failed');
          },
        },
        projectRoot: '/project',
        deps: { fs: mockFs },
      });
    });
  });

  describe('startServer', () => {
    it('starts TDD server when tddMode is true', async () => {
      let tddHandlerCreated = false;
      let httpServerStarted = false;
      let serverJsonWritten = false;

      let mockHandler = {
        initialize: async () => {},
        tddService: {},
      };

      let deps = {
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

      let result = await startServer({
        config: { server: { port: 47392 } },
        buildId: 'build-123',
        tddMode: true,
        setBaseline: false,
        projectRoot: '/project',
        services: {},
        deps,
      });

      assert.strictEqual(tddHandlerCreated, true);
      assert.strictEqual(httpServerStarted, true);
      assert.strictEqual(serverJsonWritten, true);
      assert.strictEqual(result.tddMode, true);
    });

    it('starts API server when tddMode is false with apiKey', async () => {
      let apiHandlerCreated = false;

      let deps = {
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

      await startServer({
        config: { server: { port: 47392 }, apiKey: 'test-key' },
        buildId: 'build-123',
        tddMode: false,
        setBaseline: false,
        projectRoot: '/project',
        services: {},
        deps,
      });

      assert.strictEqual(apiHandlerCreated, true);
    });

    it('handles null httpServer', async () => {
      let deps = {
        createHttpServer: () => null,
        createTddHandler: () => ({
          initialize: async () => {},
          tddService: {},
        }),
        createApiHandler: () => ({}),
        createApiClient: () => ({}),
        fs: {
          mkdirSync: () => {},
          writeFileSync: () => {},
        },
      };

      // Should not throw
      let result = await startServer({
        config: { server: { port: 47392 } },
        buildId: null,
        tddMode: true,
        setBaseline: false,
        projectRoot: '/project',
        services: {},
        deps,
      });

      assert.strictEqual(result.httpServer, null);
    });
  });
});
