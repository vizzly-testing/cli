import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadCommand,
  validateUploadOptions,
} from '../../src/commands/upload.js';

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

vi.mock('../../src/services/api-service.js', () => ({
  ApiService: vi.fn(() => ({
    getTokenContext: vi.fn(),
  })),
}));

describe('uploadCommand', () => {
  let mockUI;
  let mockUploader;
  let mockContainer;
  let mockApiService;

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

    mockUploader = {
      upload: vi.fn(),
      waitForBuild: vi.fn(),
    };

    mockContainer = {
      get: vi.fn(() => mockUploader),
    };

    mockApiService = {
      getTokenContext: vi.fn(),
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
    const { ApiService } = await import('../../src/services/api-service.js');

    ConsoleUI.mockReturnValue(mockUI);
    createServiceContainer.mockResolvedValue(mockContainer);
    ApiService.mockReturnValue(mockApiService);

    loadConfig.mockResolvedValue({
      apiKey: 'test-api-key',
      apiUrl: 'https://vizzly.dev/api',
      build: { environment: 'test', name: 'test-build' },
      comparison: { threshold: 0.1 },
    });

    detectBranch.mockResolvedValue('main');
    detectCommit.mockResolvedValue('abc123');
    getCommitMessage.mockResolvedValue('Test commit');
    detectCommitMessage.mockResolvedValue('Test commit');
    detectPullRequestNumber.mockReturnValue(null);
    generateBuildNameWithGit.mockResolvedValue('test-build');

    mockUploader.upload.mockResolvedValue({
      buildId: 'build123',
      url: 'https://vizzly.dev/build/123',
      stats: {
        uploaded: 5,
        total: 5,
      },
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('successful upload', () => {
    it('should upload screenshots successfully', async () => {
      await uploadCommand('./screenshots', {}, { verbose: false });

      expect(mockUI.info).toHaveBeenCalledWith('Starting upload process...');
      expect(mockUploader.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          screenshotsDir: './screenshots',
          buildName: 'test-build',
          branch: 'main',
          commit: 'abc123',
          message: 'Test commit',
          environment: 'test',
          threshold: 0.1,
          metadata: {},
        })
      );
      expect(mockUI.success).toHaveBeenCalledWith(
        'Upload completed successfully'
      );
    });

    it('should handle verbose mode correctly', async () => {
      await uploadCommand('./screenshots', {}, { verbose: true });

      expect(mockUI.info).toHaveBeenCalledWith(
        'Configuration loaded',
        expect.objectContaining({
          branch: 'main',
          commit: 'abc123',
          environment: 'test',
        })
      );
    });

    it('should show upload summary', async () => {
      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        '🐻 Vizzly: Uploaded 5 of 5 screenshots to build build123'
      );
      expect(mockUI.info).toHaveBeenCalledWith(
        '🔗 Vizzly: View results at https://vizzly.dev/build/123'
      );
    });

    it('should wait for build completion when --wait is specified', async () => {
      mockUploader.waitForBuild.mockResolvedValue({
        passedComparisons: 4,
        failedComparisons: 1,
        url: 'https://vizzly.dev/build/123',
      });

      await uploadCommand('./screenshots', { wait: true }, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        'Waiting for build completion...'
      );
      expect(mockUploader.waitForBuild).toHaveBeenCalledWith('build123');
      expect(mockUI.success).toHaveBeenCalledWith('Build processing completed');
      expect(mockUI.warning).toHaveBeenCalledWith(
        '1 visual comparisons failed'
      );
    });

    it('should show success message when all comparisons pass', async () => {
      mockUploader.waitForBuild.mockResolvedValue({
        passedComparisons: 5,
        failedComparisons: 0,
        url: 'https://vizzly.dev/build/123',
      });

      await uploadCommand('./screenshots', { wait: true }, {});

      expect(mockUI.success).toHaveBeenCalledWith(
        'All 5 visual comparisons passed'
      );
    });

    it('should handle custom metadata', async () => {
      const metadata = { version: '1.0.0', feature: 'login' };

      await uploadCommand(
        './screenshots',
        { metadata: JSON.stringify(metadata) },
        {}
      );

      expect(mockUploader.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        })
      );
    });

    it('should handle all upload options', async () => {
      const options = {
        buildName: 'custom-build',
        branch: 'feature-branch',
        commit: 'def456',
        message: 'Custom message',
        threshold: 0.05,
        metadata: '{"test": true}',
        wait: true,
      };

      // Override config to use CLI-provided threshold
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: 'test-api-key',
        apiUrl: 'https://vizzly.dev/api',
        build: { environment: 'test', name: 'test-build' },
        comparison: { threshold: 0.05 }, // Use CLI-provided threshold
      });

      // Override mocks to return the CLI-provided values
      const { detectBranch, detectCommit, generateBuildNameWithGit } =
        await import('../../src/utils/git.js');
      detectBranch.mockResolvedValue('feature-branch');
      detectCommit.mockResolvedValue('def456');
      generateBuildNameWithGit.mockResolvedValue('custom-build');

      await uploadCommand('./screenshots', options, {});

      expect(mockUploader.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          buildName: 'custom-build',
          branch: 'feature-branch',
          commit: 'def456',
          message: 'Custom message',
          threshold: 0.05,
          metadata: { test: true },
        })
      );
    });
  });

  describe('URL construction', () => {
    it('should use API-provided URL when available', async () => {
      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        '🔗 Vizzly: View results at https://vizzly.dev/build/123'
      );
    });

    it('should construct URL with org/project context when available', async () => {
      mockUploader.upload.mockResolvedValue({
        buildId: 'build123',
        url: null, // No URL provided by API
        stats: { uploaded: 5, total: 5 },
      });

      mockApiService.getTokenContext.mockResolvedValue({
        organization: { slug: 'test-org' },
        project: { slug: 'test-project' },
      });

      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        '🔗 Vizzly: View results at https://vizzly.dev/test-org/test-project/builds/build123'
      );
    });

    it('should fall back to simple URL when context fetch fails', async () => {
      mockUploader.upload.mockResolvedValue({
        buildId: 'build123',
        url: null,
        stats: { uploaded: 5, total: 5 },
      });

      mockApiService.getTokenContext.mockRejectedValue(new Error('API error'));
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.info).toHaveBeenCalledWith(
        '🔗 Vizzly: View results at https://vizzly.dev/builds/build123'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should error when no API token is provided', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      loadConfig.mockResolvedValue({
        apiKey: null,
        build: { environment: 'test' },
        comparison: { threshold: 0.1 },
      });

      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
    });

    it('should handle config loading errors', async () => {
      const { loadConfig } = await import('../../src/utils/config-loader.js');
      const error = new Error('Config load failed');
      loadConfig.mockRejectedValue(error);

      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith('Config load failed', error);
    });

    it('should handle container creation errors', async () => {
      const { createServiceContainer } = await import(
        '../../src/container/index.js'
      );
      const error = new Error('Container creation failed');
      createServiceContainer.mockRejectedValue(error);

      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith(
        'Container creation failed',
        error
      );
    });

    it('should handle upload errors', async () => {
      const error = new Error('Upload failed');
      mockUploader.upload.mockRejectedValue(error);

      await uploadCommand('./screenshots', {}, {});

      expect(mockUI.error).toHaveBeenCalledWith('Upload failed', error);
    });

    it('should handle wait for build errors', async () => {
      const error = new Error('Build wait failed');
      mockUploader.waitForBuild.mockRejectedValue(error);

      await uploadCommand('./screenshots', { wait: true }, {});

      expect(mockUI.error).toHaveBeenCalledWith('Build wait failed', error);
    });
  });

  describe('progress handling', () => {
    it('should handle progress callbacks', async () => {
      let progressCallback;
      mockUploader.upload.mockImplementation(options => {
        progressCallback = options.onProgress;
        return Promise.resolve({
          buildId: 'build123',
          stats: { uploaded: 5, total: 5 },
        });
      });

      await uploadCommand('./screenshots', {}, {});

      // Test progress callback
      progressCallback({
        message: 'Uploading file 1/5',
        current: 1,
        total: 5,
        phase: 'upload',
      });

      expect(mockUI.progress).toHaveBeenCalledWith('Uploading file 1/5', 1, 5);
    });

    it('should handle progress callbacks with missing data', async () => {
      let progressCallback;
      mockUploader.upload.mockImplementation(options => {
        progressCallback = options.onProgress;
        return Promise.resolve({
          buildId: 'build123',
          stats: { uploaded: 5, total: 5 },
        });
      });

      await uploadCommand('./screenshots', {}, {});

      // Test progress callback with minimal data
      progressCallback({
        phase: 'processing',
      });

      expect(mockUI.progress).toHaveBeenCalledWith(
        'processing',
        undefined,
        undefined
      );
    });
  });

  describe('options merging', () => {
    it('should merge global and local options correctly', async () => {
      const globalOptions = { verbose: true, json: true };
      const options = { wait: true };

      await uploadCommand('./screenshots', options, globalOptions);

      expect(mockUploader.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          screenshotsDir: './screenshots',
        })
      );
    });

    it('should pass through all required upload options', async () => {
      await uploadCommand('./screenshots', {}, {});

      expect(mockUploader.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          screenshotsDir: './screenshots',
          buildName: 'test-build',
          branch: 'main',
          commit: 'abc123',
          message: 'Test commit',
          environment: 'test',
          threshold: 0.1,
          metadata: {},
          onProgress: expect.any(Function),
        })
      );
    });
  });
});

describe('validateUploadOptions', () => {
  describe('screenshots path validation', () => {
    it('should pass with valid screenshots path', () => {
      const errors = validateUploadOptions('./screenshots', {});
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing screenshots path', () => {
      const errors = validateUploadOptions(null, {});
      expect(errors).toContain('Screenshots path is required');
    });

    it('should fail with empty screenshots path', () => {
      const errors = validateUploadOptions('', {});
      expect(errors).toContain('Screenshots path is required');
    });
  });

  describe('metadata validation', () => {
    it('should pass with valid JSON metadata', () => {
      const errors = validateUploadOptions('./screenshots', {
        metadata: '{"version": "1.0.0"}',
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid JSON metadata', () => {
      const errors = validateUploadOptions('./screenshots', {
        metadata: 'invalid-json',
      });
      expect(errors).toContain('Invalid JSON in --metadata option');
    });

    it('should pass when metadata is not provided', () => {
      const errors = validateUploadOptions('./screenshots', {});
      expect(errors).toHaveLength(0);
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: '0.1',
      });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 0', () => {
      const errors = validateUploadOptions('./screenshots', { threshold: '0' });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 1', () => {
      const errors = validateUploadOptions('./screenshots', { threshold: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid threshold', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: 'invalid',
      });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });

    it('should fail with threshold below 0', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: '-0.1',
      });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });

    it('should fail with threshold above 1', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: '1.1',
      });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      const errors = validateUploadOptions('./screenshots', {
        batchSize: '10',
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid batch size', () => {
      const errors = validateUploadOptions('./screenshots', {
        batchSize: 'invalid',
      });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with zero batch size', () => {
      const errors = validateUploadOptions('./screenshots', { batchSize: '0' });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with negative batch size', () => {
      const errors = validateUploadOptions('./screenshots', {
        batchSize: '-5',
      });
      expect(errors).toContain('Batch size must be a positive integer');
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      const errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '30000',
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid upload timeout', () => {
      const errors = validateUploadOptions('./screenshots', {
        uploadTimeout: 'invalid',
      });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });

    it('should fail with zero upload timeout', () => {
      const errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '0',
      });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const errors = validateUploadOptions(null, {
        metadata: 'invalid-json',
        threshold: '2',
        batchSize: '-1',
        uploadTimeout: '0',
      });

      expect(errors).toHaveLength(5);
      expect(errors).toContain('Screenshots path is required');
      expect(errors).toContain('Invalid JSON in --metadata option');
      expect(errors).toContain('Threshold must be a number between 0 and 1');
      expect(errors).toContain('Batch size must be a positive integer');
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });
  });
});
