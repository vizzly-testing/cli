import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  cancelTests,
  createBuild,
  executeTestCommand,
  fetchBuildUrl,
  finalizeBuild,
  initializeDaemon,
} from '../../src/test-runner/operations.js';

describe('test-runner/operations', () => {
  describe('createBuild', () => {
    it('creates local build in TDD mode', async () => {
      let buildCreated = false;

      let deps = {
        buildManager: {
          createBuild: async () => {
            buildCreated = true;
            return { id: 'local-build-123' };
          },
        },
        createApiClient: () => ({}),
        createApiBuild: async () => ({}),
        output: { debug: () => {} },
      };

      let buildId = await createBuild({
        runOptions: { buildName: 'Test Build' },
        tdd: true,
        config: {},
        deps,
      });

      assert.strictEqual(buildCreated, true);
      assert.strictEqual(buildId, 'local-build-123');
    });

    it('creates API build when not in TDD mode', async () => {
      let apiClientCreated = false;
      let apiBuildCreated = false;

      let deps = {
        buildManager: {
          createBuild: async () => ({ id: 'local' }),
        },
        createApiClient: () => {
          apiClientCreated = true;
          return {};
        },
        createApiBuild: async () => {
          apiBuildCreated = true;
          return { id: 'api-build-456' };
        },
        output: { debug: () => {} },
      };

      let buildId = await createBuild({
        runOptions: { buildName: 'API Build' },
        tdd: false,
        config: { apiKey: 'test-key', apiUrl: 'https://api.test' },
        deps,
      });

      assert.strictEqual(apiClientCreated, true);
      assert.strictEqual(apiBuildCreated, true);
      assert.strictEqual(buildId, 'api-build-456');
    });

    it('throws when no API key in non-TDD mode', async () => {
      let deps = {
        buildManager: { createBuild: async () => ({}) },
        createApiClient: () => ({}),
        createApiBuild: async () => ({}),
        output: { debug: () => {} },
      };

      await assert.rejects(
        () =>
          createBuild({
            runOptions: {},
            tdd: false,
            config: {}, // No apiKey
            deps,
          }),
        error => {
          assert.ok(error.message.includes('No API key'));
          return true;
        }
      );
    });
  });

  describe('fetchBuildUrl', () => {
    it('returns build URL from API', async () => {
      let deps = {
        createApiClient: () => ({}),
        getBuild: async () => ({ url: 'https://app.vizzly.dev/builds/123' }),
        output: { debug: () => {} },
      };

      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: { apiKey: 'key', apiUrl: 'https://api.test' },
        deps,
      });

      assert.strictEqual(url, 'https://app.vizzly.dev/builds/123');
    });

    it('returns null when no API key', async () => {
      let deps = {
        createApiClient: () => ({}),
        getBuild: async () => ({ url: 'https://app.vizzly.dev/builds/123' }),
        output: { debug: () => {} },
      };

      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: {}, // No apiKey
        deps,
      });

      assert.strictEqual(url, null);
    });

    it('returns null on API error', async () => {
      let debugCalled = false;

      let deps = {
        createApiClient: () => ({}),
        getBuild: async () => {
          throw new Error('API error');
        },
        output: {
          debug: () => {
            debugCalled = true;
          },
        },
      };

      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: { apiKey: 'key', apiUrl: 'https://api.test' },
        deps,
      });

      assert.strictEqual(url, null);
      assert.strictEqual(debugCalled, true);
    });

    it('returns null when build has no url field', async () => {
      let deps = {
        createApiClient: () => ({}),
        getBuild: async () => ({ id: 'build-123' }), // No url field
        output: { debug: () => {} },
      };

      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: { apiKey: 'key', apiUrl: 'https://api.test' },
        deps,
      });

      assert.strictEqual(url, null);
    });
  });

  describe('finalizeBuild', () => {
    it('does nothing when buildId is null', async () => {
      let finalizeCalled = false;

      let deps = {
        serverManager: {},
        createApiClient: () => ({}),
        finalizeApiBuild: async () => {
          finalizeCalled = true;
        },
        output: { debug: () => {}, warn: () => {} },
      };

      await finalizeBuild({
        buildId: null,
        tdd: false,
        success: true,
        executionTime: 1000,
        config: {},
        deps,
      });

      assert.strictEqual(finalizeCalled, false);
    });

    it('finalizes via server handler in TDD mode', async () => {
      let serverFinalized = false;

      let deps = {
        serverManager: {
          server: {
            finishBuild: async () => {
              serverFinalized = true;
            },
          },
        },
        createApiClient: () => ({}),
        finalizeApiBuild: async () => {},
        output: { debug: () => {}, warn: () => {} },
      };

      await finalizeBuild({
        buildId: 'build-123',
        tdd: true,
        success: true,
        executionTime: 1000,
        config: {},
        deps,
      });

      assert.strictEqual(serverFinalized, true);
    });

    it('finalizes via API in non-TDD mode', async () => {
      let apiFinalized = false;
      let serverFinalized = false;

      let deps = {
        serverManager: {
          server: {
            finishBuild: async () => {
              serverFinalized = true;
            },
          },
        },
        createApiClient: () => ({}),
        finalizeApiBuild: async () => {
          apiFinalized = true;
        },
        output: { debug: () => {}, warn: () => {} },
      };

      await finalizeBuild({
        buildId: 'build-123',
        tdd: false,
        success: true,
        executionTime: 1000,
        config: { apiKey: 'key', apiUrl: 'https://api.test' },
        deps,
      });

      assert.strictEqual(serverFinalized, true);
      assert.strictEqual(apiFinalized, true);
    });

    it('warns when no API service available in non-TDD mode', async () => {
      let warnCalled = false;

      let deps = {
        serverManager: { server: null },
        createApiClient: () => ({}),
        finalizeApiBuild: async () => {},
        output: {
          debug: () => {},
          warn: () => {
            warnCalled = true;
          },
        },
      };

      await finalizeBuild({
        buildId: 'build-123',
        tdd: false,
        success: true,
        executionTime: 1000,
        config: {}, // No apiKey
        deps,
      });

      assert.strictEqual(warnCalled, true);
    });

    it('calls onFinalizeFailed callback on error', async () => {
      let failedCallbackCalled = false;
      let failedError = null;

      let deps = {
        serverManager: {
          server: {
            finishBuild: async () => {
              throw new Error('Finalize failed');
            },
          },
        },
        createApiClient: () => ({}),
        finalizeApiBuild: async () => {},
        output: { debug: () => {}, warn: () => {} },
        onFinalizeFailed: ({ error }) => {
          failedCallbackCalled = true;
          failedError = error;
        },
      };

      await finalizeBuild({
        buildId: 'build-123',
        tdd: true,
        success: true,
        executionTime: 1000,
        config: {},
        deps,
      });

      assert.strictEqual(failedCallbackCalled, true);
      assert.strictEqual(failedError, 'Finalize failed');
    });
  });

  describe('executeTestCommand', () => {
    it('resolves on successful exit', async () => {
      let spawnedCommand = null;

      let mockProcess = {
        on: (event, callback) => {
          if (event === 'exit') {
            // Simulate successful exit
            process.nextTick(() => callback(0, null));
          }
        },
      };

      let deps = {
        spawn: command => {
          spawnedCommand = command;
          return mockProcess;
        },
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      let result = await executeTestCommand({
        command: 'npm test',
        env: { NODE_ENV: 'test' },
        deps,
      });

      assert.strictEqual(spawnedCommand, 'npm test');
      assert.ok(result.process);
    });

    it('rejects on non-zero exit code', async () => {
      let mockProcess = {
        on: (event, callback) => {
          if (event === 'exit') {
            process.nextTick(() => callback(1, null));
          }
        },
      };

      let deps = {
        spawn: () => mockProcess,
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      await assert.rejects(
        () =>
          executeTestCommand({
            command: 'npm test',
            env: {},
            deps,
          }),
        error => {
          assert.ok(error.message.includes('exited with code 1'));
          assert.strictEqual(error.code, 'TEST_COMMAND_FAILED');
          return true;
        }
      );
    });

    it('rejects on SIGINT signal', async () => {
      let mockProcess = {
        on: (event, callback) => {
          if (event === 'exit') {
            process.nextTick(() => callback(null, 'SIGINT'));
          }
        },
      };

      let deps = {
        spawn: () => mockProcess,
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      await assert.rejects(
        () =>
          executeTestCommand({
            command: 'npm test',
            env: {},
            deps,
          }),
        error => {
          assert.ok(error.message.includes('interrupted'));
          assert.strictEqual(error.code, 'TEST_COMMAND_INTERRUPTED');
          return true;
        }
      );
    });

    it('rejects on spawn error', async () => {
      let mockProcess = {
        on: (event, callback) => {
          if (event === 'error') {
            process.nextTick(() => callback(new Error('Command not found')));
          }
        },
      };

      let deps = {
        spawn: () => mockProcess,
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
      };

      await assert.rejects(
        () =>
          executeTestCommand({
            command: 'nonexistent-command',
            env: {},
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Failed to run test command'));
          assert.strictEqual(error.code, 'TEST_COMMAND_FAILED');
          return true;
        }
      );
    });
  });

  describe('initializeDaemon', () => {
    it('starts daemon server in TDD mode', async () => {
      let serverStarted = false;
      let onReadyCalled = false;

      let deps = {
        serverManager: {
          start: async () => {
            serverStarted = true;
          },
        },
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        output: { error: () => {} },
        onServerReady: () => {
          onReadyCalled = true;
        },
      };

      await initializeDaemon({
        initOptions: { tdd: true, daemon: true, port: 47392 },
        deps,
      });

      assert.strictEqual(serverStarted, true);
      assert.strictEqual(onReadyCalled, true);
    });

    it('throws for non-TDD daemon mode', async () => {
      let deps = {
        serverManager: { start: async () => {} },
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        output: { error: () => {} },
      };

      await assert.rejects(
        () =>
          initializeDaemon({
            initOptions: { tdd: false, daemon: true },
            deps,
          }),
        error => {
          assert.strictEqual(error.code, 'INVALID_MODE');
          return true;
        }
      );
    });

    it('logs and rethrows on server start failure', async () => {
      let errorLogged = false;

      let deps = {
        serverManager: {
          start: async () => {
            throw new Error('Port in use');
          },
        },
        createError: (msg, code) => {
          let err = new Error(msg);
          err.code = code;
          return err;
        },
        output: {
          error: () => {
            errorLogged = true;
          },
        },
      };

      await assert.rejects(
        () =>
          initializeDaemon({
            initOptions: { tdd: true, daemon: true },
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Port in use'));
          return true;
        }
      );

      assert.strictEqual(errorLogged, true);
    });
  });

  describe('cancelTests', () => {
    it('kills test process and stops server', async () => {
      let processKilled = false;
      let serverStopped = false;

      let mockProcess = {
        killed: false,
        kill: signal => {
          processKilled = true;
          assert.strictEqual(signal, 'SIGKILL');
        },
      };

      let deps = {
        serverManager: {
          stop: async () => {
            serverStopped = true;
          },
        },
      };

      await cancelTests({
        testProcess: mockProcess,
        deps,
      });

      assert.strictEqual(processKilled, true);
      assert.strictEqual(serverStopped, true);
    });

    it('handles already killed process', async () => {
      let killCalled = false;

      let mockProcess = {
        killed: true,
        kill: () => {
          killCalled = true;
        },
      };

      let deps = {
        serverManager: { stop: async () => {} },
      };

      await cancelTests({
        testProcess: mockProcess,
        deps,
      });

      assert.strictEqual(killCalled, false);
    });

    it('handles null test process', async () => {
      let serverStopped = false;

      let deps = {
        serverManager: {
          stop: async () => {
            serverStopped = true;
          },
        },
      };

      await cancelTests({
        testProcess: null,
        deps,
      });

      assert.strictEqual(serverStopped, true);
    });

    it('handles null server manager', async () => {
      // Should not throw
      await cancelTests({
        testProcess: null,
        deps: { serverManager: null },
      });
    });
  });
});
