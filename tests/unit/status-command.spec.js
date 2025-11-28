import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  statusCommand,
  validateStatusOptions,
} from '../../src/commands/status.js';

// Mock dependencies
const mockConsoleUIStore = { mockInstance: null };

vi.mock('../../src/utils/config-loader.js');
vi.mock('../../src/utils/console-ui.js', () => ({
  ConsoleUI: vi.fn(function () {
    return mockConsoleUIStore.mockInstance;
  }),
}));
vi.mock('../../src/services/index.js');
vi.mock('../../src/utils/environment-config.js');

const mockConsoleUI = {
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  data: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  cleanup: vi.fn(),
};

const mockApiService = { getBuild: vi.fn() };

const mockCreateServices = vi.fn();
const mockServices = {
  apiService: mockApiService,
};

const mockGetApiUrl = vi.fn();

const mockLoadConfig = vi.fn();

describe('Status Command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mocks
    mockConsoleUIStore.mockInstance = mockConsoleUI;

    const { loadConfig } = await import('../../src/utils/config-loader.js');
    loadConfig.mockImplementation(mockLoadConfig);

    const { createServices } = await import('../../src/services/index.js');
    createServices.mockImplementation(mockCreateServices);

    const { getApiUrl } = await import('../../src/utils/environment-config.js');
    getApiUrl.mockImplementation(mockGetApiUrl);

    // Default mock responses
    mockLoadConfig.mockResolvedValue({
      apiKey: 'test-token',
      apiUrl: 'https://api.test.com',
    });

    mockCreateServices.mockReturnValue(mockServices);
    mockGetApiUrl.mockReturnValue('http://localhost:3000');

    // Mock API response matching real structure
    mockApiService.getBuild.mockResolvedValue({
      build: {
        id: 'build-123',
        name: 'test-build',
        status: 'completed',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:01:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        environment: 'test',
        branch: 'main',
        commit_sha: 'abc123def456',
        commit_message: 'Test commit message',
        screenshot_count: 5,
        total_comparisons: 5,
        new_comparisons: 3,
        changed_comparisons: 1,
        identical_comparisons: 1,
        approval_status: 'pending',
        project_id: 'proj-123',
        execution_time_ms: 30000,
        is_baseline: false,
        user_agent: 'vizzly-cli/0.1.0 (test)',
        approved_screenshots: 0,
        rejected_screenshots: 0,
        pending_screenshots: 5,
        completed_jobs: 5,
        failed_jobs: 0,
        processing_screenshots: 0,
        avg_diff_percentage: 0.05,
        github_pull_request_number: null,
        started_at: '2024-01-01T00:00:30Z',
      },
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
      expect(mockCreateServices).toHaveBeenCalledWith(
        expect.any(Object),
        'status'
      );
      expect(mockApiService.getBuild).toHaveBeenCalledWith('build-123');

      // Check for the new UI output format
      expect(mockConsoleUI.success).toHaveBeenCalledWith('Build: test-build');
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Status: COMPLETED');
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Environment: test');
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Branch: main');
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Commit: abc123de - Test commit message'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Screenshots: 5 total');
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Comparisons: 5 total (3 new, 1 changed, 1 identical)'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Approval Status: pending'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'View Build: http://localhost:3000/projects/proj-123/builds/build-123'
      );
      expect(mockConsoleUI.cleanup).toHaveBeenCalled();
    });

    it('should show verbose information when verbose flag is set', async () => {
      await statusCommand('build-123', {}, { verbose: true, json: false });

      // Verify verbose output is shown
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        '\n--- Additional Details ---'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Screenshot Approvals: 0 approved, 0 rejected, 5 pending'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Average Diff: 5.00%');
      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'User Agent: vizzly-cli/0.1.0 (test)'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Build ID: build-123');
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Project ID: proj-123');
    });

    it('should show progress for processing builds', async () => {
      mockApiService.getBuild.mockResolvedValue({
        build: {
          id: 'build-123',
          name: 'processing-build',
          status: 'processing',
          environment: 'test',
          completed_jobs: 7,
          failed_jobs: 0,
          processing_screenshots: 3,
          screenshot_count: 10,
          total_comparisons: 10,
          new_comparisons: 10,
          changed_comparisons: 0,
          identical_comparisons: 0,
          project_id: 'proj-123',
        },
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
      mockApiService.getBuild.mockResolvedValue({
        build: {
          id: 'build-123',
          name: 'failed-build',
          status: 'failed',
          environment: 'test',
          failed_jobs: 2,
          completed_jobs: 3,
          project_id: 'proj-123',
          screenshot_count: 5,
          total_comparisons: 5,
          new_comparisons: 5,
          changed_comparisons: 0,
          identical_comparisons: 0,
        },
      });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await statusCommand('build-123', {}, { verbose: false, json: false });

      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Build not found');
      mockApiService.getBuild.mockRejectedValue(apiError);

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

    it('should output structured data in JSON mode', async () => {
      await statusCommand('build-123', {}, { verbose: false, json: true });

      expect(mockConsoleUI.data).toHaveBeenCalledWith({
        buildId: 'build-123',
        status: 'completed',
        name: 'test-build',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
        completedAt: '2024-01-01T00:01:00Z',
        environment: 'test',
        branch: 'main',
        commit: 'abc123def456',
        commitMessage: 'Test commit message',
        screenshotsTotal: 5,
        comparisonsTotal: 5,
        newComparisons: 3,
        changedComparisons: 1,
        identicalComparisons: 1,
        approvalStatus: 'pending',
        executionTime: 30000,
        isBaseline: false,
        userAgent: 'vizzly-cli/0.1.0 (test)',
      });
    });

    it('should handle build with missing optional fields', async () => {
      mockApiService.getBuild.mockResolvedValue({
        build: {
          id: 'build-minimal',
          status: 'completed',
          environment: 'test',
          project_id: 'proj-123',
          screenshot_count: 0,
          total_comparisons: 0,
          new_comparisons: 0,
          changed_comparisons: 0,
          identical_comparisons: 0,
        },
      });

      await statusCommand('build-minimal', {}, { verbose: false, json: false });

      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        'Build: build-minimal'
      );
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Status: COMPLETED');
      expect(mockConsoleUI.info).toHaveBeenCalledWith('Screenshots: 0 total');
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
