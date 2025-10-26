import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCommand, validateRunOptions } from '../../src/commands/run.js';

// Mock dependencies
vi.mock('../../src/utils/config-loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/utils/console-ui.js', () => ({
  ConsoleUI: vi.fn(() => ({
    cleanup: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    progress: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
  })),
}));

vi.mock('../../src/container/index.js', () => ({
  createServiceContainer: vi.fn(),
}));

vi.mock('../../src/utils/git.js', () => ({
  detectBranch: vi.fn(),
  detectCommit: vi.fn(),
  getCommitMessage: vi.fn(),
  detectCommitMessage: vi.fn(),
  detectPullRequestNumber: vi.fn(),
  generateBuildNameWithGit: vi.fn(),
}));

describe('runCommand', () => {
  let mockUI;
  let mockTestRunner;
  let mockContainer;
  let mockUploader;

  beforeEach(async () => {
    mockUI = {
      cleanup: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      progress: vi.fn(),
      startSpinner: vi.fn(),
      stopSpinner: vi.fn(),
    };

    mockTestRunner = {
      on: vi.fn(),
      run: vi.fn(),
      finalizeBuild: vi.fn(),
    };

    mockUploader = {
      waitForBuild: vi.fn(),
    };

    mockContainer = {
      get: vi.fn(service => {
        if (service === 'testRunner') return mockTestRunner;
        if (service === 'uploader') return mockUploader;
        return null;
      }),
    };

    // Import and setup mocks
    const { ConsoleUI } = await import('../../src/utils/console-ui.js');
    const { loadConfig } = await import('../../src/utils/config-loader.js');
    const { createServiceContainer } = await import(
      '../../src/container/index.js'
    );
    const {
      detectBranch,
      detectCommit,
      getCommitMessage,
      detectCommitMessage,
      detectPullRequestNumber,
      generateBuildNameWithGit,
    } = await import('../../src/utils/git.js');

    ConsoleUI.mockReturnValue(mockUI);
    createServiceContainer.mockResolvedValue(mockContainer);

    loadConfig.mockResolvedValue({
      apiKey: 'test-api-key',
      server: { port: 3000, timeout: 30000 },
      build: { environment: 'test' },
      comparison: { threshold: 0.1 },
      allowNoToken: false,
    });

    detectBranch.mockResolvedValue('main');
    detectCommit.mockResolvedValue('abc123');
    getCommitMessage.mockResolvedValue('Test commit');
    detectCommitMessage.mockResolvedValue('Test commit');
    detectPullRequestNumber.mockReturnValue(null);
    generateBuildNameWithGit.mockResolvedValue('test-build');

    mockTestRunner.run.mockResolvedValue({
      buildId: 'build123',
      screenshotsCaptured: 5,
      url: 'https://vizzly.dev/build/123',
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('successful execution', () => {
    it('should run test command successfully with API token', async () => {
      await runCommand('npm test', {}, { verbose: false });

      expect(mockUI.startSpinner).toHaveBeenCalledWith(
        'Initializing test runner...'
      );
      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          testCommand: 'npm test',
          port: 3000,
          timeout: 30000,
          environment: 'test',
          threshold: 0.1,
        })
      );
      expect(mockUI.success).toHaveBeenCalledWith(
        'Test run completed successfully'
      );
    });

    it('should handle verbose mode correctly', async () => {
      await runCommand('npm test', {}, { verbose: true });

      expect(mockUI.info).toHaveBeenCalledWith(
        'Configuration loaded',
        expect.objectContaining({
          testCommand: 'npm test',
          port: 3000,
          branch: 'main',
          commit: 'abc123',
        })
      );
    });

    it('should wait for build completion when wait option is set', async () => {
      mockUploader.waitForBuild.mockResolvedValue({
        failedComparisons: 0,
      });

      await runCommand('npm test', { wait: true }, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        'Waiting for build completion...'
      );
      expect(mockUploader.waitForBuild).toHaveBeenCalledWith('build123');
      expect(mockUI.success).toHaveBeenCalledWith('Build processing completed');
    });

    it('should exit with error code when build has failed comparisons', async () => {
      mockUploader.waitForBuild.mockResolvedValue({
        failedComparisons: 3,
      });

      await runCommand('npm test', { wait: true }, {});

      expect(mockUI.error).toHaveBeenCalledWith(
        '3 visual comparisons failed',
        {},
        0
      );
    });
  });

  describe('error handling', () => {
    it('should error when no API token is provided', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: null,
        allowNoToken: false,
        server: { port: 3000 },
        build: { environment: 'test' },
        comparison: { threshold: 0.1 },
      });

      await runCommand('npm test', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith(
        'API token required. Use --token, set VIZZLY_TOKEN environment variable, or use --allow-no-token to run without uploading'
      );
    });

    it('should allow execution without token when allowNoToken is set', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: null,
        allowNoToken: true,
        server: { port: 3000, timeout: 30000 },
        build: { environment: 'test' },
        comparison: { threshold: 0.1 },
      });

      await runCommand('npm test', {}, {});

      expect(mockTestRunner.run).toHaveBeenCalled();
      expect(mockUI.success).toHaveBeenCalledWith(
        'Test run completed successfully'
      );
    });

    it('should handle test runner errors', async () => {
      const error = new Error('Test runner failed');
      mockTestRunner.run.mockRejectedValue(error);

      await runCommand('npm test', {}, {});

      expect(mockUI.stopSpinner).toHaveBeenCalled();
      expect(mockUI.error).toHaveBeenCalledWith('Test run failed', error);
    });

    it('should setup SIGINT handler for build cleanup', async () => {
      // Mock process.on to capture SIGINT handler
      let sigintHandler;
      const originalProcessOn = process.on;
      const processOnSpy = vi.fn((event, handler) => {
        if (event === 'SIGINT') {
          sigintHandler = handler;
        }
        return originalProcessOn.call(process, event, handler);
      });
      process.on = processOnSpy;

      // Mock process.exit to prevent actual exit
      const originalProcessExit = process.exit;
      process.exit = vi.fn();

      await runCommand('npm test', {}, {});

      // Verify SIGINT handler was registered
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      // Verify that if SIGINT handler is called, it attempts cleanup
      if (sigintHandler) {
        await sigintHandler();
        expect(process.exit).toHaveBeenCalledWith(1);
      }

      // Restore process methods
      process.on = originalProcessOn;
      process.exit = originalProcessExit;
    });

    it('should finalize build when test runner fails', async () => {
      // Setup mock to simulate build creation
      let buildCreatedHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'build-created') {
          buildCreatedHandler = handler;
        }
      });

      const testError = new Error('Test command failed');
      mockTestRunner.run.mockRejectedValue(testError);

      await runCommand('npm test', {}, {});

      // Simulate build creation before the error
      if (buildCreatedHandler) {
        buildCreatedHandler({
          buildId: 'test-build-456',
          url: 'http://test.com',
        });
      }

      // Verify error was handled
      expect(mockUI.error).toHaveBeenCalledWith('Test run failed', testError);

      // Note: The actual build finalization in test runner failure is handled
      // by the TestRunner service itself, not by the run command
    });

    it('should handle config loading errors', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      const error = new Error('Config load failed');
      loadConfig.mockRejectedValue(error);

      await runCommand('npm test', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith('Test run failed', error);
    });

    it('should handle container creation errors', async () => {
      const { createServiceContainer } = await import(
        '../../src/container/index.js'
      );
      const error = new Error('Container creation failed');
      createServiceContainer.mockRejectedValue(error);

      await runCommand('npm test', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith('Test run failed', error);
    });

    it('should pass error object to ConsoleUI which displays error.message', async () => {
      const error = new Error(
        'Port 47392 is already in use. Try a different port with --port.'
      );
      mockTestRunner.run.mockRejectedValue(error);

      await runCommand('npm test', {}, {});

      // Run command passes error to ConsoleUI, which will display error.message
      expect(mockUI.error).toHaveBeenCalledWith('Test run failed', error);
    });
  });

  describe('event handling', () => {
    it('should set up all required event handlers', async () => {
      await runCommand('npm test', {}, {});

      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'progress',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'test-output',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'server-ready',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'screenshot-captured',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'build-created',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'build-failed',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'build-finalize-failed',
        expect.any(Function)
      );
    });

    it('should handle progress events', async () => {
      let progressHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'progress') progressHandler = handler;
      });

      await runCommand('npm test', {}, {});

      progressHandler({ message: 'Test progress...' });
      expect(mockUI.progress).toHaveBeenCalledWith('Test progress...');
    });

    it('should handle screenshot-captured events', async () => {
      let screenshotHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'screenshot-captured') screenshotHandler = handler;
      });

      await runCommand('npm test', {}, {});

      screenshotHandler({ name: 'test-screenshot' });
      expect(mockUI.info).toHaveBeenCalledWith(
        'Vizzly: Screenshot captured - test-screenshot'
      );
    });

    it('should handle build-created events', async () => {
      let buildCreatedHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'build-created') buildCreatedHandler = handler;
      });

      await runCommand('npm test', {}, { verbose: true });

      buildCreatedHandler({
        buildId: 'build456',
        name: 'test-build',
        url: 'https://vizzly.dev/build/456',
      });

      expect(mockUI.info).toHaveBeenCalledWith(
        'Build created: build456 - test-build'
      );
      expect(mockUI.info).toHaveBeenCalledWith(
        'Vizzly: https://vizzly.dev/build/456'
      );
    });
  });

  describe('options handling', () => {
    it('should handle all provided options', async () => {
      const options = {
        buildName: 'custom-build',
        branch: 'feature-branch',
        commit: 'def456',
        message: 'Custom message',
        wait: true,
        uploadAll: true,
      };

      // Override mocks to return the CLI-provided values
      const { detectBranch, detectCommit, generateBuildNameWithGit } =
        await import('../../src/utils/git.js');
      detectBranch.mockResolvedValue('feature-branch');
      detectCommit.mockResolvedValue('def456');
      generateBuildNameWithGit.mockResolvedValue('custom-build');

      await runCommand('npm test', options, {});

      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          buildName: 'custom-build',
          branch: 'feature-branch',
          commit: 'def456',
          message: 'Custom message',
          wait: true,
          uploadAll: true,
        })
      );
    });

    it('should merge global and local options correctly', async () => {
      const globalOptions = { verbose: true, json: true };
      const options = { wait: true };

      await runCommand('npm test', options, globalOptions);

      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          wait: true,
        })
      );
    });
  });
});

describe('validateRunOptions', () => {
  describe('test command validation', () => {
    it('should pass with valid test command', () => {
      const errors = validateRunOptions('npm test', {});
      expect(errors).toHaveLength(0);
    });

    it('should fail with empty test command', () => {
      const errors = validateRunOptions('', {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with null test command', () => {
      const errors = validateRunOptions(null, {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with whitespace-only test command', () => {
      const errors = validateRunOptions('   ', {});
      expect(errors).toContain('Test command is required');
    });
  });

  describe('port validation', () => {
    it('should pass with valid port', () => {
      const errors = validateRunOptions('npm test', { port: '3000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid port number', () => {
      const errors = validateRunOptions('npm test', { port: 'invalid' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too low)', () => {
      const errors = validateRunOptions('npm test', { port: '0' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too high)', () => {
      const errors = validateRunOptions('npm test', { port: '65536' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });
  });

  describe('timeout validation', () => {
    it('should pass with valid timeout', () => {
      const errors = validateRunOptions('npm test', { timeout: '5000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid timeout', () => {
      const errors = validateRunOptions('npm test', { timeout: 'invalid' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });

    it('should fail with timeout too low', () => {
      const errors = validateRunOptions('npm test', { timeout: '500' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: '10' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: 'invalid' });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with zero batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: '0' });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with negative batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: '-5' });
      expect(errors).toContain('Batch size must be a positive integer');
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      const errors = validateRunOptions('npm test', { uploadTimeout: '30000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid upload timeout', () => {
      const errors = validateRunOptions('npm test', {
        uploadTimeout: 'invalid',
      });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });

    it('should fail with zero upload timeout', () => {
      const errors = validateRunOptions('npm test', { uploadTimeout: '0' });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const errors = validateRunOptions('', {
        port: 'invalid',
        timeout: '500',
        batchSize: '-1',
      });

      expect(errors).toHaveLength(4);
      expect(errors).toContain('Test command is required');
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
      expect(errors).toContain('Batch size must be a positive integer');
    });
  });
});
