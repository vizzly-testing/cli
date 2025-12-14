import { describe, expect, it, vi } from 'vitest';
import {
  cancelTests,
  createBuild,
  executeTestCommand,
  fetchBuildUrl,
  finalizeBuild,
  initializeDaemon,
} from '../../src/test-runner/operations.js';

// ============================================================================
// Test Helpers - Stubs and Factories
// ============================================================================

function createMockOutput() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };
}

function createMockBuildManager(overrides = {}) {
  return {
    createBuild: vi.fn().mockResolvedValue({ id: 'local-build-123' }),
    finalizeBuild: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockServerManager(overrides = {}) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getTddResults: vi.fn().mockResolvedValue(null),
    server: {
      finishBuild: vi.fn().mockResolvedValue(undefined),
      getScreenshotCount: vi.fn().mockReturnValue(0),
    },
    ...overrides,
  };
}

function createMockApiClient() {
  return {
    request: vi.fn(),
    getBaseUrl: vi.fn(() => 'https://api.vizzly.dev'),
  };
}

function createMockSpawn() {
  let mockProcess = {
    on: vi.fn(),
    kill: vi.fn(),
    killed: false,
  };

  let spawn = vi.fn(() => mockProcess);
  spawn.__process = mockProcess;

  return spawn;
}

function createMockError(message, code) {
  let error = new Error(message);
  error.code = code;
  return error;
}

// ============================================================================
// Tests
// ============================================================================

describe('test-runner/operations', () => {
  describe('createBuild', () => {
    describe('TDD mode', () => {
      it('creates local build via buildManager', async () => {
        let buildManager = createMockBuildManager();
        let output = createMockOutput();

        let buildId = await createBuild({
          runOptions: { buildName: 'Test Build' },
          tdd: true,
          config: {},
          deps: {
            buildManager,
            createApiClient: vi.fn(),
            createApiBuild: vi.fn(),
            output,
          },
        });

        expect(buildManager.createBuild).toHaveBeenCalledWith({
          buildName: 'Test Build',
        });
        expect(buildId).toBe('local-build-123');
        expect(output.debug).toHaveBeenCalledWith('build', 'created local-bu');
      });
    });

    describe('API mode', () => {
      it('creates build via API', async () => {
        let mockClient = createMockApiClient();
        let createApiClient = vi.fn(() => mockClient);
        let createApiBuild = vi.fn().mockResolvedValue({ id: 'api-build-456' });
        let output = createMockOutput();

        let buildId = await createBuild({
          runOptions: { buildName: 'API Build', branch: 'main' },
          tdd: false,
          config: { apiKey: 'test-key', apiUrl: 'https://api.example.com' },
          deps: {
            buildManager: createMockBuildManager(),
            createApiClient,
            createApiBuild,
            output,
          },
        });

        expect(createApiClient).toHaveBeenCalledWith({
          baseUrl: 'https://api.example.com',
          token: 'test-key',
          command: 'run',
        });
        expect(createApiBuild).toHaveBeenCalledWith(
          mockClient,
          expect.objectContaining({
            name: 'API Build',
            branch: 'main',
          })
        );
        expect(buildId).toBe('api-build-456');
      });

      it('includes comparison metadata when provided', async () => {
        let createApiBuild = vi.fn().mockResolvedValue({ id: 'build-123' });

        await createBuild({
          runOptions: {},
          tdd: false,
          config: {
            apiKey: 'test-key',
            apiUrl: 'https://api.example.com',
            comparison: { threshold: 5.0, minClusterSize: 10 },
          },
          deps: {
            buildManager: createMockBuildManager(),
            createApiClient: vi.fn(() => createMockApiClient()),
            createApiBuild,
            output: createMockOutput(),
          },
        });

        expect(createApiBuild).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            metadata: {
              comparison: {
                threshold: 5.0,
                minClusterSize: 10,
              },
            },
          })
        );
      });

      it('throws when no API key', async () => {
        await expect(
          createBuild({
            runOptions: {},
            tdd: false,
            config: { apiUrl: 'https://api.example.com' },
            deps: {
              buildManager: createMockBuildManager(),
              createApiClient: vi.fn(),
              createApiBuild: vi.fn(),
              output: createMockOutput(),
            },
          })
        ).rejects.toThrow('No API key available for build creation');
      });
    });
  });

  describe('fetchBuildUrl', () => {
    it('returns build URL from API', async () => {
      let mockClient = createMockApiClient();
      let createApiClient = vi.fn(() => mockClient);
      let getBuild = vi
        .fn()
        .mockResolvedValue({ url: 'https://app.vizzly.dev/builds/123' });

      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: { apiKey: 'test-key', apiUrl: 'https://api.example.com' },
        deps: { createApiClient, getBuild, output: createMockOutput() },
      });

      expect(url).toBe('https://app.vizzly.dev/builds/123');
    });

    it('returns null when no API key', async () => {
      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: {},
        deps: {
          createApiClient: vi.fn(),
          getBuild: vi.fn(),
          output: createMockOutput(),
        },
      });

      expect(url).toBeNull();
    });

    it('returns null when API call fails', async () => {
      let getBuild = vi.fn().mockRejectedValue(new Error('Network error'));
      let output = createMockOutput();

      let url = await fetchBuildUrl({
        buildId: 'build-123',
        config: { apiKey: 'test-key', apiUrl: 'https://api.example.com' },
        deps: {
          createApiClient: vi.fn(() => createMockApiClient()),
          getBuild,
          output,
        },
      });

      expect(url).toBeNull();
      expect(output.debug).toHaveBeenCalledWith(
        'build',
        'could not retrieve url',
        expect.any(Object)
      );
    });
  });

  describe('finalizeBuild', () => {
    describe('TDD mode', () => {
      it('calls server finishBuild', async () => {
        let serverManager = createMockServerManager();
        let output = createMockOutput();

        await finalizeBuild({
          buildId: 'build-123',
          tdd: true,
          success: true,
          executionTime: 1000,
          config: {},
          deps: {
            serverManager,
            createApiClient: vi.fn(),
            finalizeApiBuild: vi.fn(),
            output,
          },
        });

        expect(serverManager.server.finishBuild).toHaveBeenCalledWith(
          'build-123'
        );
        expect(output.debug).toHaveBeenCalledWith('build', 'finalized', {
          success: true,
        });
      });
    });

    describe('API mode', () => {
      it('flushes uploads and calls API finalize', async () => {
        let serverManager = createMockServerManager();
        let mockClient = createMockApiClient();
        let createApiClient = vi.fn(() => mockClient);
        let finalizeApiBuild = vi.fn().mockResolvedValue(undefined);
        let output = createMockOutput();

        await finalizeBuild({
          buildId: 'build-456',
          tdd: false,
          success: false,
          executionTime: 2000,
          config: { apiKey: 'test-key', apiUrl: 'https://api.example.com' },
          deps: {
            serverManager,
            createApiClient,
            finalizeApiBuild,
            output,
          },
        });

        expect(serverManager.server.finishBuild).toHaveBeenCalledWith(
          'build-456'
        );
        expect(finalizeApiBuild).toHaveBeenCalledWith(
          mockClient,
          'build-456',
          false,
          2000
        );
        expect(output.debug).toHaveBeenCalledWith(
          'build',
          'finalized via api',
          { success: false }
        );
      });

      it('warns when no API key in API mode', async () => {
        let serverManager = createMockServerManager();
        let output = createMockOutput();

        await finalizeBuild({
          buildId: 'build-789',
          tdd: false,
          success: true,
          executionTime: 1000,
          config: {},
          deps: {
            serverManager,
            createApiClient: vi.fn(),
            finalizeApiBuild: vi.fn(),
            output,
          },
        });

        expect(output.warn).toHaveBeenCalledWith(
          'No API service available to finalize build build-789'
        );
      });
    });

    it('does nothing when buildId is null', async () => {
      let serverManager = createMockServerManager();

      await finalizeBuild({
        buildId: null,
        tdd: true,
        success: true,
        executionTime: 1000,
        config: {},
        deps: {
          serverManager,
          createApiClient: vi.fn(),
          finalizeApiBuild: vi.fn(),
          output: createMockOutput(),
        },
      });

      expect(serverManager.server.finishBuild).not.toHaveBeenCalled();
    });

    it('catches finalization errors and warns', async () => {
      let serverManager = createMockServerManager();
      serverManager.server.finishBuild.mockRejectedValue(
        new Error('Finalize failed')
      );
      let output = createMockOutput();
      let onFinalizeFailed = vi.fn();

      await finalizeBuild({
        buildId: 'build-123',
        tdd: true,
        success: true,
        executionTime: 1000,
        config: {},
        deps: {
          serverManager,
          createApiClient: vi.fn(),
          finalizeApiBuild: vi.fn(),
          output,
          onFinalizeFailed,
        },
      });

      expect(output.warn).toHaveBeenCalledWith(
        'Failed to finalize build build-123:',
        'Finalize failed'
      );
      expect(onFinalizeFailed).toHaveBeenCalledWith({
        buildId: 'build-123',
        error: 'Finalize failed',
        stack: expect.any(String),
      });
    });
  });

  describe('executeTestCommand', () => {
    it('spawns process with correct options', async () => {
      let spawn = createMockSpawn();
      let process = spawn.__process;

      // Simulate successful exit
      process.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          Promise.resolve().then(() => callback(0, null));
        }
      });

      let promise = executeTestCommand({
        command: 'npm test',
        env: { NODE_ENV: 'test' },
        deps: { spawn, createError: createMockError },
      });

      await promise;

      expect(spawn).toHaveBeenCalledWith('npm test', {
        env: { NODE_ENV: 'test' },
        stdio: 'inherit',
        shell: true,
      });
    });

    it('rejects on non-zero exit code', async () => {
      let spawn = createMockSpawn();
      let process = spawn.__process;

      process.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          Promise.resolve().then(() => callback(1, null));
        }
      });

      await expect(
        executeTestCommand({
          command: 'npm test',
          env: {},
          deps: { spawn, createError: createMockError },
        })
      ).rejects.toThrow('Test command exited with code 1');
    });

    it('rejects on SIGINT', async () => {
      let spawn = createMockSpawn();
      let process = spawn.__process;

      process.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          Promise.resolve().then(() => callback(null, 'SIGINT'));
        }
      });

      await expect(
        executeTestCommand({
          command: 'npm test',
          env: {},
          deps: { spawn, createError: createMockError },
        })
      ).rejects.toThrow('Test command was interrupted');
    });

    it('rejects on spawn error', async () => {
      let spawn = createMockSpawn();
      let process = spawn.__process;

      process.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          Promise.resolve().then(() =>
            callback(new Error('Command not found'))
          );
        }
      });

      await expect(
        executeTestCommand({
          command: 'invalid-command',
          env: {},
          deps: { spawn, createError: createMockError },
        })
      ).rejects.toThrow('Failed to run test command: Command not found');
    });
  });

  describe('initializeDaemon', () => {
    it('starts server in daemon mode', async () => {
      let serverManager = createMockServerManager();
      let onServerReady = vi.fn();

      await initializeDaemon({
        initOptions: { tdd: true, daemon: true, port: 8080 },
        deps: {
          serverManager,
          createError: createMockError,
          output: createMockOutput(),
          onServerReady,
        },
      });

      expect(serverManager.start).toHaveBeenCalledWith(null, true, false);
      expect(onServerReady).toHaveBeenCalledWith({
        port: 8080,
        mode: 'daemon',
        tdd: true,
      });
    });

    it('throws when not in TDD daemon mode', async () => {
      await expect(
        initializeDaemon({
          initOptions: { tdd: false, daemon: true },
          deps: {
            serverManager: createMockServerManager(),
            createError: createMockError,
            output: createMockOutput(),
          },
        })
      ).rejects.toThrow('Initialize method is only for TDD daemon mode');
    });

    it('passes setBaseline option', async () => {
      let serverManager = createMockServerManager();

      await initializeDaemon({
        initOptions: { tdd: true, daemon: true, setBaseline: true },
        deps: {
          serverManager,
          createError: createMockError,
          output: createMockOutput(),
        },
      });

      expect(serverManager.start).toHaveBeenCalledWith(null, true, true);
    });

    it('propagates server start errors', async () => {
      let serverManager = createMockServerManager();
      serverManager.start.mockRejectedValue(new Error('Port in use'));
      let output = createMockOutput();

      await expect(
        initializeDaemon({
          initOptions: { tdd: true, daemon: true },
          deps: {
            serverManager,
            createError: createMockError,
            output,
          },
        })
      ).rejects.toThrow('Port in use');

      expect(output.error).toHaveBeenCalledWith(
        'Failed to initialize TDD daemon server:',
        expect.any(Error)
      );
    });
  });

  describe('cancelTests', () => {
    it('kills running process', async () => {
      let testProcess = { kill: vi.fn(), killed: false };
      let serverManager = createMockServerManager();

      await cancelTests({
        testProcess,
        deps: { serverManager },
      });

      expect(testProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(serverManager.stop).toHaveBeenCalled();
    });

    it('does not kill already killed process', async () => {
      let testProcess = { kill: vi.fn(), killed: true };
      let serverManager = createMockServerManager();

      await cancelTests({
        testProcess,
        deps: { serverManager },
      });

      expect(testProcess.kill).not.toHaveBeenCalled();
      expect(serverManager.stop).toHaveBeenCalled();
    });

    it('handles null testProcess', async () => {
      let serverManager = createMockServerManager();

      await cancelTests({
        testProcess: null,
        deps: { serverManager },
      });

      expect(serverManager.stop).toHaveBeenCalled();
    });

    it('handles null serverManager', async () => {
      await cancelTests({
        testProcess: { kill: vi.fn(), killed: false },
        deps: { serverManager: null },
      });

      // Should not throw
    });
  });
});
