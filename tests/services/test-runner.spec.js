import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestRunner } from '../../src/services/test-runner.js';

// Mock output module
vi.mock('../../src/utils/output.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

// Mock dependencies
vi.mock('../../src/errors/vizzly-error.js', () => ({
  VizzlyError: class extends Error {
    constructor(message, code = 'VIZZLY_ERROR') {
      super(message);
      this.name = 'VizzlyError';
      this.code = code;
    }
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock the functional API module
vi.mock('../../src/api/index.js', () => ({
  createApiClient: vi.fn(() => ({
    request: vi.fn(),
    getBaseUrl: vi.fn(() => 'https://api.vizzly.dev'),
    getToken: vi.fn(() => 'test-api-key'),
    getUserAgent: vi.fn(() => 'vizzly-cli/test'),
  })),
  createBuild: vi.fn(),
  getBuild: vi.fn(),
  finalizeBuild: vi.fn(),
}));

describe('TestRunner', () => {
  let testRunner;
  let mockConfig;
  let mockBuildManager;
  let mockServerManager;
  let mockTddService;
  let mockSpawnProcess;

  beforeEach(async () => {
    mockConfig = {
      server: {
        port: 3000,
      },
      apiKey: 'test-api-key',
    };

    mockBuildManager = {
      createBuild: vi.fn(),
      finalizeBuild: vi.fn(),
      getCurrentBuild: vi.fn(),
    };

    mockServerManager = {
      start: vi.fn(),
      stop: vi.fn(),
      server: {
        emitter: {
          on: vi.fn(),
        },
        finishBuild: vi.fn(),
      },
    };

    mockTddService = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    // Mock spawn process
    mockSpawnProcess = {
      on: vi.fn(),
      kill: vi.fn(),
    };

    const { spawn } = await import('node:child_process');
    spawn.mockReturnValue(mockSpawnProcess);

    testRunner = new TestRunner(
      mockConfig,
      mockBuildManager,
      mockServerManager,
      mockTddService
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with all required dependencies', () => {
      expect(testRunner.config).toBe(mockConfig);
      expect(testRunner.buildManager).toBe(mockBuildManager);
      expect(testRunner.serverManager).toBe(mockServerManager);
      expect(testRunner.tddService).toBe(mockTddService);
      expect(testRunner.testProcess).toBe(null);
    });
  });

  describe('run', () => {
    it('throws error when no test command provided', async () => {
      await expect(testRunner.run({})).rejects.toThrow(
        'No test command provided'
      );
    });

    it('successfully runs test command without TDD', async () => {
      // Mock the API functions
      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({
        id: 'build123',
        url: 'http://example.com/build/123',
      });
      api.getBuild.mockResolvedValue({
        id: 'build123',
        url: 'http://example.com/build/123',
      });
      api.finalizeBuild.mockResolvedValue();

      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      // Mock successful process execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0); // Exit with success code
        }
      });

      let options = {
        testCommand: 'npm test',
        tdd: false,
      };

      await testRunner.run(options);

      expect(mockServerManager.start).toHaveBeenCalledWith(
        'build123',
        false,
        false // setBaseline is now normalized to false instead of undefined
      );
      expect(api.createBuild).toHaveBeenCalled();
      expect(api.finalizeBuild).toHaveBeenCalled();
      expect(mockServerManager.stop).toHaveBeenCalled();
      expect(mockBuildManager.createBuild).not.toHaveBeenCalled();
    });

    it('successfully runs test command with TDD enabled', async () => {
      const mockBuild = { id: 'build456' };
      mockBuildManager.createBuild.mockResolvedValue(mockBuild);
      mockBuildManager.getCurrentBuild.mockReturnValue(mockBuild);
      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();
      mockTddService.start.mockResolvedValue();
      mockTddService.stop.mockResolvedValue();
      mockBuildManager.finalizeBuild.mockResolvedValue();

      // Mock successful process execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      const options = {
        testCommand: 'jest --watch',
        tdd: true,
      };

      await testRunner.run(options);

      expect(mockServerManager.start).toHaveBeenCalledWith(
        'build456',
        true,
        false // setBaseline is now normalized to false instead of undefined
      );
      expect(mockBuildManager.createBuild).toHaveBeenCalled();
      expect(mockServerManager.server.finishBuild).toHaveBeenCalledWith(
        'build456'
      );
      expect(mockServerManager.stop).toHaveBeenCalled();
    });

    it('handles test execution failure', async () => {
      const mockBuild = { id: 'build789' };
      mockBuildManager.createBuild.mockResolvedValue(mockBuild);
      mockBuildManager.getCurrentBuild.mockReturnValue(mockBuild);
      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();
      mockBuildManager.finalizeBuild.mockResolvedValue();

      // Mock failed process execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(1), 0); // Exit with error code
        }
      });

      const options = {
        testCommand: 'npm test',
        tdd: true, // Enable TDD mode so finalizeBuild gets called
      };

      await expect(testRunner.run(options)).rejects.toThrow(
        'Test command exited with code 1'
      );

      expect(mockServerManager.server.finishBuild).toHaveBeenCalledWith(
        'build789'
      );
      expect(mockServerManager.stop).toHaveBeenCalled();
    });

    it('handles server start failure', async () => {
      // Mock API functions for build creation
      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({ id: 'build123' });
      api.finalizeBuild.mockResolvedValue();

      mockServerManager.start.mockRejectedValue(
        new Error('Server failed to start')
      );
      mockServerManager.stop.mockResolvedValue();

      let options = {
        testCommand: 'npm test',
      };

      await expect(testRunner.run(options)).rejects.toThrow(
        'Server failed to start'
      );

      expect(mockServerManager.stop).toHaveBeenCalled();
    });

    it('handles build creation failure', async () => {
      mockServerManager.start.mockResolvedValue();
      mockBuildManager.createBuild.mockRejectedValue(
        new Error('Build creation failed')
      );
      mockServerManager.stop.mockResolvedValue();

      const options = {
        testCommand: 'npm test',
        tdd: true, // Enable TDD mode so buildManager.createBuild gets called
      };

      await expect(testRunner.run(options)).rejects.toThrow(
        'Build creation failed'
      );

      expect(mockServerManager.stop).toHaveBeenCalled();
    });

    it('ensures cleanup even when error occurs', async () => {
      const mockBuild = { id: 'build123' };
      mockBuildManager.createBuild.mockResolvedValue(mockBuild);
      mockBuildManager.getCurrentBuild.mockReturnValue(mockBuild);
      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();
      mockTddService.start.mockResolvedValue();
      mockTddService.stop.mockResolvedValue();
      mockBuildManager.finalizeBuild.mockResolvedValue();

      // Mock process error
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Process spawn failed')), 0);
        }
      });

      const options = {
        testCommand: 'invalid-command',
        tdd: true,
      };

      await expect(testRunner.run(options)).rejects.toThrow(
        'Failed to run test command: Process spawn failed'
      );

      // Verify cleanup happened
      expect(mockServerManager.stop).toHaveBeenCalled();
    });
  });

  describe('executeTestCommand', () => {
    it('executes command with correct environment variables', async () => {
      const { spawn } = await import('node:child_process');

      // Mock successful execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      const env = {
        NODE_ENV: 'test',
        VIZZLY_SERVER_URL: 'http://localhost:3000',
        VIZZLY_BUILD_ID: 'build123',
      };

      await testRunner.executeTestCommand('npm test', env);

      expect(spawn).toHaveBeenCalledWith('npm test', {
        env,
        stdio: 'inherit',
        shell: true,
      });
    });

    it('handles command execution errors', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found')), 0);
        }
      });

      await expect(
        testRunner.executeTestCommand('invalid-command', {})
      ).rejects.toThrow('Failed to run test command: Command not found');
    });

    it('handles non-zero exit codes', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(2), 0); // Exit with error code 2
        }
      });

      await expect(
        testRunner.executeTestCommand('npm test', {})
      ).rejects.toThrow('Test command exited with code 2');
    });

    it('handles SIGINT interruption correctly', async () => {
      let exitHandler;

      // Mock spawn process to capture event handlers
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          exitHandler = callback;
        }
      });

      const executePromise = testRunner.executeTestCommand('npm test', {});

      // Simulate the process exiting due to SIGINT
      if (exitHandler) {
        exitHandler(null, 'SIGINT');
      }

      await expect(executePromise).rejects.toThrow(
        'Test command was interrupted'
      );
    });

    it('parses complex commands with arguments correctly', async () => {
      const { spawn } = await import('node:child_process');

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      await testRunner.executeTestCommand(
        'jest --coverage --verbose --watch',
        {}
      );

      expect(spawn).toHaveBeenCalledWith('jest --coverage --verbose --watch', {
        env: {},
        stdio: 'inherit',
        shell: true,
      });
    });

    it('stores test process reference', async () => {
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      const promise = testRunner.executeTestCommand('npm test', {});

      // Process should be stored immediately
      expect(testRunner.testProcess).toBe(mockSpawnProcess);

      await promise;
    });
  });

  describe('cancel', () => {
    it('kills test process when running', async () => {
      testRunner.testProcess = mockSpawnProcess;

      await testRunner.cancel();

      expect(mockSpawnProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('does nothing when no test process is running', async () => {
      testRunner.testProcess = null;

      await testRunner.cancel();

      // Should not throw or call kill
      expect(mockSpawnProcess.kill).not.toHaveBeenCalled();
    });
  });

  describe('integration workflow', () => {
    it('properly sets up environment variables', async () => {
      let { spawn } = await import('node:child_process');

      // Mock API functions for build creation
      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({ id: 'integration-build' });
      api.getBuild.mockResolvedValue({ id: 'integration-build' });
      api.finalizeBuild.mockResolvedValue();

      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      let options = {
        testCommand: 'npm run e2e',
      };

      await testRunner.run(options);

      expect(spawn).toHaveBeenCalledWith(
        'npm run e2e',
        expect.objectContaining({
          env: expect.objectContaining({
            VIZZLY_SERVER_URL: 'http://localhost:3000',
            VIZZLY_BUILD_ID: 'integration-build',
            VIZZLY_ENABLED: 'true',
          }),
        })
      );
    });

    it('maintains process reference during execution', async () => {
      // Mock API functions for build creation
      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({ id: 'ref-test' });
      api.getBuild.mockResolvedValue({ id: 'ref-test' });
      api.finalizeBuild.mockResolvedValue();

      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      let processRef = null;
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          processRef = testRunner.testProcess;
          setTimeout(() => callback(0), 0);
        }
      });

      await testRunner.run({ testCommand: 'npm test' });

      expect(processRef).toBe(mockSpawnProcess);
    });
  });

  describe('TDD results retrieval', () => {
    it('should return TDD results with screenshot count and comparisons', async () => {
      const mockBuild = { id: 'build-tdd-123' };
      mockBuildManager.createBuild.mockResolvedValue(mockBuild);
      mockBuildManager.getCurrentBuild.mockReturnValue(mockBuild);
      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      // Mock TDD results
      const mockTddResults = {
        total: 5,
        passed: 4,
        failed: 1,
        comparisons: [
          { name: 'test-1', status: 'passed' },
          { name: 'test-2', status: 'passed' },
          { name: 'test-3', status: 'passed' },
          { name: 'test-4', status: 'passed' },
          { name: 'test-5', status: 'failed' },
        ],
      };
      mockServerManager.getTddResults = vi
        .fn()
        .mockResolvedValue(mockTddResults);

      // Mock successful test execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      const result = await testRunner.run({
        testCommand: 'npm test',
        tdd: true,
      });

      expect(mockServerManager.getTddResults).toHaveBeenCalled();
      expect(result.screenshotsCaptured).toBe(5);
      expect(result.comparisons).toEqual(mockTddResults.comparisons);
      expect(result.failed).toBe(true); // Because 1 comparison failed
    });

    it('should handle missing getTddResults gracefully', async () => {
      const mockBuild = { id: 'build-tdd-456' };
      mockBuildManager.createBuild.mockResolvedValue(mockBuild);
      mockBuildManager.getCurrentBuild.mockReturnValue(mockBuild);
      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      // No getTddResults method on serverManager
      delete mockServerManager.getTddResults;

      // Mock successful test execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      const result = await testRunner.run({
        testCommand: 'npm test',
        tdd: true,
      });

      // Should still return a valid result with defaults
      expect(result.screenshotsCaptured).toBe(0);
      expect(result.comparisons).toBeNull();
      expect(result.failed).toBe(false);
    });

    it('should not call getTddResults in API mode', async () => {
      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({ id: 'api-build-123' });
      api.getBuild.mockResolvedValue({ id: 'api-build-123' });
      api.finalizeBuild.mockResolvedValue();

      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();
      mockServerManager.getTddResults = vi.fn();

      // Mock successful test execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      await testRunner.run({
        testCommand: 'npm test',
        tdd: false, // API mode
      });

      expect(mockServerManager.getTddResults).not.toHaveBeenCalled();
    });
  });

  describe('Build Metadata', () => {
    it('should include threshold in build metadata when provided', async () => {
      testRunner = new TestRunner(
        {
          ...mockConfig,
          comparison: { threshold: 5.0 },
        },
        mockBuildManager,
        mockServerManager,
        mockTddService
      );

      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({
        id: 'build-123',
        url: 'https://app.vizzly.dev/builds/build-123',
      });

      await testRunner.createBuild({ buildName: 'Test Build' }, false);

      expect(api.createBuild).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            comparison: {
              threshold: 5.0,
              minClusterSize: undefined,
            },
          },
        })
      );
    });

    it('should include minClusterSize in build metadata when provided', async () => {
      testRunner = new TestRunner(
        {
          ...mockConfig,
          comparison: { threshold: 2.0, minClusterSize: 5 },
        },
        mockBuildManager,
        mockServerManager,
        mockTddService
      );

      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({
        id: 'build-456',
        url: 'https://app.vizzly.dev/builds/build-456',
      });

      await testRunner.createBuild({ buildName: 'Test Build' }, false);

      expect(api.createBuild).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            comparison: {
              threshold: 2.0,
              minClusterSize: 5,
            },
          },
        })
      );
    });

    it('should not include metadata when no comparison config provided', async () => {
      testRunner = new TestRunner(
        mockConfig,
        mockBuildManager,
        mockServerManager,
        mockTddService
      );

      let api = await import('../../src/api/index.js');
      api.createBuild.mockResolvedValue({
        id: 'build-789',
        url: 'https://app.vizzly.dev/builds/build-789',
      });

      await testRunner.createBuild({ buildName: 'Test Build' }, false);

      // The second arg to createBuild is the payload
      let createBuildCall = api.createBuild.mock.calls[0][1];
      expect(createBuildCall.metadata).toBeUndefined();
    });
  });
});
