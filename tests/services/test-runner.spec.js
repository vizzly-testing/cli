import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestRunner } from '../../src/services/test-runner.js';

// Mock dependencies
vi.mock('../../src/services/base-service.js', () => ({
  BaseService: class {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
    }

    emit() {
      // Mock emit function
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

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../src/services/api-service.js', () => ({
  ApiService: vi.fn(() => ({
    createBuild: vi.fn(),
    getBuild: vi.fn(),
    finalizeBuild: vi.fn(),
  })),
}));

describe('TestRunner', () => {
  let testRunner;
  let mockConfig;
  let mockLogger;
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

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
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

    const { spawn } = await import('child_process');
    spawn.mockReturnValue(mockSpawnProcess);

    testRunner = new TestRunner(
      mockConfig,
      mockLogger,
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
      expect(testRunner.logger).toBe(mockLogger);
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
      // Mock the API service methods
      const mockApiService = {
        createBuild: vi.fn().mockResolvedValue({
          id: 'build123',
          url: 'http://example.com/build/123',
        }),
        getBuild: vi.fn().mockResolvedValue({
          id: 'build123',
          url: 'http://example.com/build/123',
        }),
        finalizeBuild: vi.fn().mockResolvedValue(),
      };

      const { ApiService } = await import('../../src/services/api-service.js');
      ApiService.mockReturnValue(mockApiService);

      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      // Mock successful process execution
      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0); // Exit with success code
        }
      });

      const options = {
        testCommand: 'npm test',
        tdd: false,
      };

      await testRunner.run(options);

      expect(mockServerManager.start).toHaveBeenCalledWith(
        'build123',
        false,
        undefined
      );
      expect(mockApiService.createBuild).toHaveBeenCalled();
      expect(mockApiService.finalizeBuild).toHaveBeenCalled();
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
        undefined
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
      // Mock API service for build creation
      const mockApiService = {
        createBuild: vi.fn().mockResolvedValue({ id: 'build123' }),
        finalizeBuild: vi.fn().mockResolvedValue(),
      };
      const { ApiService } = await import('../../src/services/api-service.js');
      ApiService.mockReturnValue(mockApiService);

      mockServerManager.start.mockRejectedValue(
        new Error('Server failed to start')
      );
      mockServerManager.stop.mockResolvedValue();

      const options = {
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
      const { spawn } = await import('child_process');

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
      const { spawn } = await import('child_process');

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
      const { spawn } = await import('child_process');

      // Mock API service for build creation
      const mockApiService = {
        createBuild: vi.fn().mockResolvedValue({ id: 'integration-build' }),
        getBuild: vi.fn().mockResolvedValue({ id: 'integration-build' }),
        finalizeBuild: vi.fn().mockResolvedValue(),
      };
      const { ApiService } = await import('../../src/services/api-service.js');
      ApiService.mockReturnValue(mockApiService);

      mockServerManager.start.mockResolvedValue();
      mockServerManager.stop.mockResolvedValue();

      mockSpawnProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          setTimeout(() => callback(0), 0);
        }
      });

      const options = {
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
      // Mock API service for build creation
      const mockApiService = {
        createBuild: vi.fn().mockResolvedValue({ id: 'ref-test' }),
        getBuild: vi.fn().mockResolvedValue({ id: 'ref-test' }),
        finalizeBuild: vi.fn().mockResolvedValue(),
      };
      const { ApiService } = await import('../../src/services/api-service.js');
      ApiService.mockReturnValue(mockApiService);

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
});
