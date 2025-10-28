import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tddCommand, validateTddOptions } from '../../src/commands/tdd.js';

// Mock dependencies
vi.mock('../../src/utils/config-loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/utils/console-ui.js', () => ({
  ConsoleUI: vi.fn(function () {
    return {
      cleanup: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      progress: vi.fn(),
      startSpinner: vi.fn(),
      stopSpinner: vi.fn(),
    };
  }),
}));

vi.mock('../../src/container/index.js', () => ({
  createServiceContainer: vi.fn(),
}));

vi.mock('../../src/utils/git.js', () => ({
  detectBranch: vi.fn(),
  detectCommit: vi.fn(),
}));

describe('tddCommand', () => {
  let mockUI;
  let mockTestRunner;
  let mockContainer;

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
    };

    mockContainer = {
      get: vi.fn(() => mockTestRunner),
    };

    // Import and setup mocks
    const { ConsoleUI } = await import('../../src/utils/console-ui.js');
    const { loadConfig } = await import('../../src/utils/config-loader.js');
    const { createServiceContainer } = await import(
      '../../src/container/index.js'
    );
    const { detectBranch, detectCommit } = await import(
      '../../src/utils/git.js'
    );

    ConsoleUI.mockImplementation(function () {
      return mockUI;
    });
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

    mockTestRunner.run.mockResolvedValue({
      screenshotsCaptured: 3,
      comparisons: [
        { status: 'passed' },
        { status: 'failed' },
        { status: 'new' },
      ],
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('successful execution', () => {
    it('should run TDD command successfully with API token', async () => {
      const { result, cleanup } = await tddCommand(
        'npm test',
        {},
        { verbose: false }
      );

      expect(mockUI.startSpinner).toHaveBeenCalledWith(
        'Initializing TDD server...'
      );
      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          testCommand: 'npm test',
          port: 3000,
          timeout: 30000,
          tdd: true,
          environment: 'test',
          threshold: 0.1,
          wait: false,
        })
      );
      expect(mockUI.success).toHaveBeenCalledWith('TDD test run completed');

      // Test the new return structure
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // Failed because one comparison failed
      expect(result.exitCode).toBe(1);
      expect(typeof cleanup).toBe('function');

      // Test cleanup function
      await cleanup();
      expect(mockUI.cleanup).toHaveBeenCalled();
    });

    it('should auto-detect missing token and enable local-only mode', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: null,
        server: { port: 3000, timeout: 30000 },
        build: { environment: 'test' },
        comparison: { threshold: 0.1 },
        allowNoToken: false,
      });

      const { cleanup } = await tddCommand('npm test', {}, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        'Running in local-only mode (no API token)'
      );
      expect(mockUI.info).toHaveBeenCalledWith(
        '📁 Will use local baselines or create new ones when screenshots differ'
      );

      // Test cleanup
      await cleanup();
    });

    it('should handle verbose mode correctly', async () => {
      const { cleanup } = await tddCommand('npm test', {}, { verbose: true });
      await cleanup();

      expect(mockUI.info).toHaveBeenCalledWith(
        'TDD Configuration loaded',
        expect.objectContaining({
          testCommand: 'npm test',
          port: 3000,
          branch: 'main',
          commit: 'abc123',
        })
      );
    });

    it('should handle set-baseline flag', async () => {
      const { cleanup } = await tddCommand(
        'npm test',
        { setBaseline: true },
        {}
      );
      await cleanup();

      expect(mockUI.info).toHaveBeenCalledWith(
        '🐻 Baseline update mode - will ignore existing baselines and create new ones'
      );
      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          setBaseline: true,
        })
      );
    });

    it('should display comparison results summary', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        '🐻 Vizzly TDD: Processed 3 screenshots'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '📊 Results: 1 passed, 1 failed, 1 new'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔍 Check diff images in .vizzly/diffs/ directory'
      );

      consoleSpy.mockRestore();
    });

    it('should exit with error code when comparisons fail', async () => {
      mockTestRunner.run.mockResolvedValue({
        screenshotsCaptured: 2,
        comparisons: [{ status: 'failed' }, { status: 'passed' }],
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.error).toHaveBeenCalledWith(
        'Visual differences detected in TDD mode',
        {},
        0
      );
    });

    it('should exit with error code when run result indicates failure', async () => {
      mockTestRunner.run.mockResolvedValue({
        failed: true,
        screenshotsCaptured: 1,
        comparisons: [],
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.error).toHaveBeenCalledWith(
        'Visual differences detected in TDD mode',
        {},
        0
      );
    });
  });

  describe('error handling', () => {
    it('should handle config loading errors', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      const error = new Error('Config load failed');
      loadConfig.mockRejectedValue(error);

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.error).toHaveBeenCalledWith('TDD test run failed', error);
    });

    it('should handle container creation errors', async () => {
      const { createServiceContainer } = await import(
        '../../src/container/index.js'
      );
      const error = new Error('Container creation failed');
      createServiceContainer.mockRejectedValue(error);

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.error).toHaveBeenCalledWith('TDD test run failed', error);
    });

    it('should handle test runner errors', async () => {
      const error = new Error('Test runner failed');
      mockTestRunner.run.mockRejectedValue(error);

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.error).toHaveBeenCalledWith('TDD test run failed', error);
    });
  });

  describe('event handling', () => {
    it('should set up all required event handlers', async () => {
      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

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
        'comparison-result',
        expect.any(Function)
      );
      expect(mockTestRunner.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
    });

    it('should handle progress events', async () => {
      let progressHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'progress') progressHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      progressHandler({ message: 'TDD progress...' });
      expect(mockUI.progress).toHaveBeenCalledWith('TDD progress...');
    });

    it('should handle screenshot-captured events', async () => {
      let screenshotHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'screenshot-captured') screenshotHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      screenshotHandler({ name: 'test-screenshot' });
      expect(mockUI.info).toHaveBeenCalledWith(
        'Vizzly TDD: Screenshot captured - test-screenshot'
      );
    });

    it('should handle comparison-result events - passed', async () => {
      let comparisonHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'comparison-result') comparisonHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      comparisonHandler({ name: 'test', status: 'passed' });
      expect(mockUI.info).toHaveBeenCalledWith(
        '✅ test: Visual comparison passed'
      );
    });

    it('should handle comparison-result events - failed', async () => {
      let comparisonHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'comparison-result') comparisonHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      comparisonHandler({
        name: 'test',
        status: 'failed',
        pixelDifference: 5.2,
      });
      expect(mockUI.warning).toHaveBeenCalledWith(
        '❌ test: Visual comparison failed (5.2% difference)'
      );
    });

    it('should handle comparison-result events - new', async () => {
      let comparisonHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'comparison-result') comparisonHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      comparisonHandler({ name: 'test', status: 'new' });
      expect(mockUI.warning).toHaveBeenCalledWith(
        '🆕 test: New screenshot (no baseline)'
      );
    });

    it('should handle server-ready events in verbose mode', async () => {
      let serverReadyHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'server-ready') serverReadyHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, { verbose: true });
      await cleanup();

      serverReadyHandler({ port: 3000 });
      expect(mockUI.info).toHaveBeenCalledWith(
        'TDD screenshot server running on port 3000'
      );
    });

    it('should handle error events', async () => {
      let errorHandler;
      mockTestRunner.on.mockImplementation((event, handler) => {
        if (event === 'error') errorHandler = handler;
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      const testError = new Error('Test error');
      errorHandler(testError);
      expect(mockUI.error).toHaveBeenCalledWith(
        'TDD test runner error occurred',
        testError,
        0
      );
    });
  });

  describe('options handling', () => {
    it('should handle baseline options', async () => {
      const options = {
        setBaseline: true,
        baselineBuildId: 'build123',
        baselineComparisonId: 'comp456',
      };

      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: 'test-key',
        server: { port: 3000, timeout: 30000 },
        build: { environment: 'test' },
        comparison: { threshold: 0.1 },
        baselineBuildId: 'build123',
        baselineComparisonId: 'comp456',
      });

      const { cleanup } = await tddCommand('npm test', options, {
        verbose: true,
      });
      await cleanup();

      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          setBaseline: true,
          baselineBuildId: 'build123',
          baselineComparisonId: 'comp456',
        })
      );
    });

    it('should merge options correctly', async () => {
      const globalOptions = { verbose: true, json: true };
      const options = { port: '4000', threshold: 0.05 };

      const { cleanup } = await tddCommand('npm test', options, globalOptions);
      await cleanup();

      expect(mockTestRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000, // From config, not overridden
          threshold: 0.1, // From config, not overridden
        })
      );
    });
  });

  describe('API token handling', () => {
    it('should show local mode message when API token is available', async () => {
      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.info).toHaveBeenCalledWith(
        'Running in local mode (API token available but not needed)'
      );
      expect(mockUI.info).toHaveBeenCalledWith(
        '📁 Will use local baselines or create new ones when screenshots differ'
      );
    });

    it('should show local-only mode message when no API token', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: null,
        server: { port: 3000, timeout: 30000 },
        build: { environment: 'test' },
        comparison: { threshold: 0.1 },
        allowNoToken: false,
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(mockUI.info).toHaveBeenCalledWith(
        'Running in local-only mode (no API token)'
      );
      expect(mockUI.info).toHaveBeenCalledWith(
        '📁 Will use local baselines or create new ones when screenshots differ'
      );
    });
  });

  describe('comparison summary', () => {
    it('should not show diff message when no failures', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockTestRunner.run.mockResolvedValue({
        screenshotsCaptured: 2,
        comparisons: [{ status: 'passed' }, { status: 'new' }],
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(consoleSpy).not.toHaveBeenCalledWith(
        '🔍 Check diff images in .vizzly/diffs/ directory'
      );
      consoleSpy.mockRestore();
    });

    it('should handle empty comparisons', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockTestRunner.run.mockResolvedValue({
        screenshotsCaptured: 1,
        comparisons: [],
      });

      const { cleanup } = await tddCommand('npm test', {}, {});
      await cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        '🐻 Vizzly TDD: Processed 1 screenshots'
      );
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/Results:/)
      );
      consoleSpy.mockRestore();
    });
  });
});

describe('validateTddOptions', () => {
  describe('test command validation', () => {
    it('should pass with valid test command', () => {
      const errors = validateTddOptions('npm test', {});
      expect(errors).toHaveLength(0);
    });

    it('should fail with empty test command', () => {
      const errors = validateTddOptions('', {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with null test command', () => {
      const errors = validateTddOptions(null, {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with whitespace-only test command', () => {
      const errors = validateTddOptions('   ', {});
      expect(errors).toContain('Test command is required');
    });
  });

  describe('port validation', () => {
    it('should pass with valid port', () => {
      const errors = validateTddOptions('npm test', { port: '3000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid port number', () => {
      const errors = validateTddOptions('npm test', { port: 'invalid' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too low)', () => {
      const errors = validateTddOptions('npm test', { port: '0' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too high)', () => {
      const errors = validateTddOptions('npm test', { port: '65536' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });
  });

  describe('timeout validation', () => {
    it('should pass with valid timeout', () => {
      const errors = validateTddOptions('npm test', { timeout: '5000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid timeout', () => {
      const errors = validateTddOptions('npm test', { timeout: 'invalid' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });

    it('should fail with timeout too low', () => {
      const errors = validateTddOptions('npm test', { timeout: '500' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      const errors = validateTddOptions('npm test', { threshold: '0.1' });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 0', () => {
      const errors = validateTddOptions('npm test', { threshold: '0' });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 1', () => {
      const errors = validateTddOptions('npm test', { threshold: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid threshold', () => {
      const errors = validateTddOptions('npm test', { threshold: 'invalid' });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });

    it('should fail with threshold below 0', () => {
      const errors = validateTddOptions('npm test', { threshold: '-0.1' });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });

    it('should fail with threshold above 1', () => {
      const errors = validateTddOptions('npm test', { threshold: '1.1' });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const errors = validateTddOptions('', {
        port: 'invalid',
        timeout: '500',
        threshold: '2',
      });

      expect(errors).toHaveLength(4);
      expect(errors).toContain('Test command is required');
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });
  });
});
