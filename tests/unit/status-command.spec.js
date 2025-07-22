import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  statusCommand,
  validateStatusOptions,
} from '../../src/commands/status.js';

// Mock dependencies
vi.mock('../../src/utils/config-loader.js');
vi.mock('../../src/utils/console-ui.js');
vi.mock('../../src/container/index.js');

const mockConsoleUI = {
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  data: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  cleanup: vi.fn(),
};

const mockApiService = {
  getBuildStatus: vi.fn(),
};

const mockContainer = {
  get: vi.fn(),
};

const mockLoadConfig = vi.fn();

describe('Status Command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mocks
    const { ConsoleUI } = await import('../../src/utils/console-ui.js');
    ConsoleUI.mockImplementation(() => mockConsoleUI);

    const { loadConfig } = await import('../../src/utils/config-loader.js');
    loadConfig.mockImplementation(mockLoadConfig);

    const { container } = await import('../../src/container/index.js');
    container.get.mockImplementation(mockContainer.get);

    // Default mock responses
    mockLoadConfig.mockResolvedValue({
      apiKey: 'test-token',
      apiUrl: 'https://api.test.com',
    });

    mockContainer.get.mockResolvedValue(mockApiService);

    mockApiService.getBuildStatus.mockResolvedValue({
      id: 'build-123',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
      environment: 'test',
      branch: 'main',
      commit: 'abc123',
      screenshotsTotal: 5,
      comparisonsTotal: 5,
      comparisonsCompleted: 5,
      comparisonsPassed: 4,
      comparisonsFailed: 1,
      url: 'https://app.vizzly.dev/builds/build-123',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('statusCommand', () => {
    it('should fetch and display build status successfully', async () => {
      await statusCommand('build-123', {}, { verbose: false, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Checking status for build: build-123'
      );
      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockContainer.get).toHaveBeenCalledWith(
        'apiService',
        expect.any(Object)
      );
      expect(mockApiService.getBuildStatus).toHaveBeenCalledWith('build-123');
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        'Build status retrieved successfully'
      );
      expect(mockConsoleUI.data).toHaveBeenCalledWith({
        buildId: 'build-123',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
        environment: 'test',
        branch: 'main',
        commit: 'abc123',
        screenshotsTotal: 5,
        comparisonsTotal: 5,
        comparisonsCompleted: 5,
        comparisonsPassed: 4,
        comparisonsFailed: 1,
        url: 'https://app.vizzly.dev/builds/build-123',
      });
      expect(mockConsoleUI.cleanup).toHaveBeenCalled();
    });

    it('should show verbose information when verbose flag is set', async () => {
      const buildWithScreenshots = {
        id: 'build-123',
        status: 'completed',
        screenshots: [{ name: 'homepage' }, { name: 'about' }],
      };

      mockApiService.getBuildStatus.mockResolvedValue(buildWithScreenshots);

      await statusCommand('build-123', {}, { verbose: true, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith('Screenshots included:', {
        count: 2,
        screenshots: ['homepage', 'about'],
      });
    });

    it('should show progress for processing builds', async () => {
      mockApiService.getBuildStatus.mockResolvedValue({
        id: 'build-123',
        status: 'processing',
        comparisonsTotal: 10,
        comparisonsCompleted: 7,
      });

      await statusCommand('build-123', {}, { verbose: false, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith('Progress: 70% complete');
    });

    it('should handle missing API token', async () => {
      mockLoadConfig.mockResolvedValue({ apiKey: null });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await statusCommand('build-123', {}, { verbose: false, json: false });

      expect(mockConsoleUI.error).toHaveBeenCalledWith(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );

      mockExit.mockRestore();
    });

    it('should exit with code 1 for failed builds', async () => {
      mockApiService.getBuildStatus.mockResolvedValue({
        id: 'build-123',
        status: 'failed',
        comparisonsFailed: 2,
      });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await statusCommand('build-123', {}, { verbose: false, json: false });

      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Build not found');
      mockApiService.getBuildStatus.mockRejectedValue(apiError);

      await statusCommand('build-123', {}, { verbose: false, json: false });

      expect(mockConsoleUI.error).toHaveBeenCalledWith(
        'Failed to get build status',
        apiError
      );
    });

    it('should use global options for config loading', async () => {
      const globalOptions = {
        config: '/custom/config.js',
        token: 'custom-token',
        verbose: true,
      };

      await statusCommand('build-123', {}, globalOptions);

      expect(mockLoadConfig).toHaveBeenCalledWith('/custom/config.js', {
        ...globalOptions,
      });
    });

    it('should pass JSON and color options to ConsoleUI', async () => {
      const globalOptions = {
        json: true,
        verbose: true,
        noColor: true,
      };

      const { ConsoleUI } = await import('../../src/utils/console-ui.js');

      await statusCommand('build-123', {}, globalOptions);

      expect(ConsoleUI).toHaveBeenCalledWith({
        json: true,
        verbose: true,
        color: false,
      });
    });
  });

  describe('validateStatusOptions', () => {
    it('should return no errors for valid build ID', () => {
      const errors = validateStatusOptions('build-123', {});
      expect(errors).toEqual([]);
    });

    it('should return error for missing build ID', () => {
      const errors = validateStatusOptions('', {});
      expect(errors).toContain('Build ID is required');
    });

    it('should return error for whitespace-only build ID', () => {
      const errors = validateStatusOptions('   ', {});
      expect(errors).toContain('Build ID is required');
    });

    it('should return error for null build ID', () => {
      const errors = validateStatusOptions(null, {});
      expect(errors).toContain('Build ID is required');
    });

    it('should return error for undefined build ID', () => {
      const errors = validateStatusOptions(undefined, {});
      expect(errors).toContain('Build ID is required');
    });
  });
});
