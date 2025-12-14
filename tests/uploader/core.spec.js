import { describe, expect, it } from 'vitest';
import {
  buildBuildInfo,
  buildCompletedProgress,
  buildDeduplicationProgress,
  buildFileMetadata,
  buildProcessingProgress,
  buildScanningProgress,
  buildScreenshotPattern,
  buildUploadingProgress,
  buildUploadResult,
  buildWaitResult,
  computeSha256,
  DEFAULT_BATCH_SIZE,
  DEFAULT_SHA_CHECK_BATCH_SIZE,
  DEFAULT_TIMEOUT,
  extractBrowserFromFilename,
  extractStatusCodeFromError,
  fileToScreenshotFormat,
  getElapsedTime,
  isTimedOut,
  partitionFilesByExistence,
  resolveBatchSize,
  resolveTimeout,
  validateApiKey,
  validateDirectoryStats,
  validateFilesFound,
  validateScreenshotsDir,
} from '../../src/uploader/core.js';

describe('uploader/core', () => {
  describe('constants', () => {
    it('has correct default values', () => {
      expect(DEFAULT_BATCH_SIZE).toBe(50);
      expect(DEFAULT_SHA_CHECK_BATCH_SIZE).toBe(100);
      expect(DEFAULT_TIMEOUT).toBe(30000);
    });
  });

  describe('validateApiKey', () => {
    it('returns valid for present API key', () => {
      let result = validateApiKey('test-api-key');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid for missing API key', () => {
      let result = validateApiKey(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API key is required');
    });

    it('returns invalid for empty API key', () => {
      let result = validateApiKey('');
      expect(result.valid).toBe(false);
    });

    it('returns invalid for null API key', () => {
      let result = validateApiKey(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateScreenshotsDir', () => {
    it('returns valid for present directory', () => {
      let result = validateScreenshotsDir('/path/to/screenshots');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid for missing directory', () => {
      let result = validateScreenshotsDir(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Screenshots directory is required');
    });

    it('returns invalid for empty directory', () => {
      let result = validateScreenshotsDir('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDirectoryStats', () => {
    it('returns valid for directory', () => {
      let stats = { isDirectory: () => true };
      let result = validateDirectoryStats(stats, '/path');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for non-directory', () => {
      let stats = { isDirectory: () => false };
      let result = validateDirectoryStats(stats, '/path/file.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('/path/file.txt is not a directory');
    });
  });

  describe('validateFilesFound', () => {
    it('returns valid for non-empty files array', () => {
      let result = validateFilesFound(['file1.png', 'file2.png'], '/dir');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for empty files array', () => {
      let result = validateFilesFound([], '/screenshots');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No screenshot files found');
      expect(result.context).toEqual({
        directory: '/screenshots',
        pattern: '**/*.png',
      });
    });

    it('returns invalid for null files', () => {
      let result = validateFilesFound(null, '/dir');
      expect(result.valid).toBe(false);
    });
  });

  describe('extractBrowserFromFilename', () => {
    it('extracts chrome from filename', () => {
      expect(extractBrowserFromFilename('homepage-chrome.png')).toBe('chrome');
    });

    it('extracts firefox from filename', () => {
      expect(extractBrowserFromFilename('login-firefox-1920.png')).toBe(
        'firefox'
      );
    });

    it('extracts safari from filename', () => {
      expect(extractBrowserFromFilename('Safari_Dashboard.png')).toBe('safari');
    });

    it('extracts edge from filename', () => {
      expect(extractBrowserFromFilename('test-edge-mobile.png')).toBe('edge');
    });

    it('extracts webkit from filename', () => {
      expect(extractBrowserFromFilename('webkit-test.png')).toBe('webkit');
    });

    it('returns null for unknown browser', () => {
      expect(extractBrowserFromFilename('screenshot.png')).toBeNull();
    });

    it('is case insensitive', () => {
      expect(extractBrowserFromFilename('CHROME-TEST.PNG')).toBe('chrome');
    });
  });

  describe('buildBuildInfo', () => {
    it('builds complete build info', () => {
      let options = {
        buildName: 'My Build',
        branch: 'feature/test',
        commit: 'abc123',
        message: 'Test commit',
        environment: 'staging',
        threshold: 0.05,
        pullRequestNumber: 42,
        parallelId: 'parallel-1',
      };

      let result = buildBuildInfo(options, 'main');

      expect(result).toEqual({
        name: 'My Build',
        branch: 'feature/test',
        commit_sha: 'abc123',
        commit_message: 'Test commit',
        environment: 'staging',
        threshold: 0.05,
        github_pull_request_number: 42,
        parallel_id: 'parallel-1',
      });
    });

    it('uses defaults for missing options', () => {
      let result = buildBuildInfo({}, 'develop');

      expect(result.branch).toBe('develop');
      expect(result.environment).toBe('production');
      expect(result.name).toMatch(/^Upload \d{4}-\d{2}-\d{2}/);
    });

    it('falls back to main when no default branch', () => {
      let result = buildBuildInfo({}, null);
      expect(result.branch).toBe('main');
    });
  });

  describe('computeSha256', () => {
    it('computes correct SHA256 hash', () => {
      let buffer = Buffer.from('test content');
      let hash = computeSha256(buffer);

      expect(hash).toBe(
        '6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72'
      );
    });

    it('returns different hashes for different content', () => {
      let hash1 = computeSha256(Buffer.from('content1'));
      let hash2 = computeSha256(Buffer.from('content2'));

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('buildFileMetadata', () => {
    it('builds metadata object', () => {
      let buffer = Buffer.from('test');
      let result = buildFileMetadata('/path/to/test.png', buffer);

      expect(result.path).toBe('/path/to/test.png');
      expect(result.filename).toBe('test.png');
      expect(result.buffer).toBe(buffer);
      expect(result.sha256).toBe(computeSha256(buffer));
    });
  });

  describe('fileToScreenshotFormat', () => {
    it('converts file metadata to screenshot format', () => {
      let file = {
        sha256: 'abc123',
        filename: 'homepage-chrome.png',
      };

      let result = fileToScreenshotFormat(file);

      expect(result).toEqual({
        sha256: 'abc123',
        name: 'homepage-chrome',
        browser: 'chrome',
        viewport_width: 1920,
        viewport_height: 1080,
      });
    });

    it('defaults to chrome browser', () => {
      let file = {
        sha256: 'abc123',
        filename: 'screenshot.png',
      };

      let result = fileToScreenshotFormat(file);
      expect(result.browser).toBe('chrome');
    });
  });

  describe('partitionFilesByExistence', () => {
    it('partitions files correctly', () => {
      let files = [
        { sha256: 'aaa', filename: 'a.png' },
        { sha256: 'bbb', filename: 'b.png' },
        { sha256: 'ccc', filename: 'c.png' },
      ];
      let existingShas = new Set(['bbb']);

      let result = partitionFilesByExistence(files, existingShas);

      expect(result.toUpload).toHaveLength(2);
      expect(result.existing).toHaveLength(1);
      expect(result.toUpload.map(f => f.sha256)).toEqual(['aaa', 'ccc']);
      expect(result.existing.map(f => f.sha256)).toEqual(['bbb']);
    });

    it('handles empty existing set', () => {
      let files = [{ sha256: 'aaa', filename: 'a.png' }];
      let result = partitionFilesByExistence(files, new Set());

      expect(result.toUpload).toHaveLength(1);
      expect(result.existing).toHaveLength(0);
    });
  });

  describe('progress builders', () => {
    it('builds scanning progress', () => {
      let result = buildScanningProgress(100);
      expect(result).toEqual({
        phase: 'scanning',
        message: 'Found 100 screenshots',
        total: 100,
      });
    });

    it('builds processing progress', () => {
      let result = buildProcessingProgress(50, 100);
      expect(result).toEqual({
        phase: 'processing',
        message: 'Processing files',
        current: 50,
        total: 100,
      });
    });

    it('builds deduplication progress', () => {
      let result = buildDeduplicationProgress(80, 20, 100);
      expect(result).toEqual({
        phase: 'deduplication',
        message: 'Checking for duplicates (80 to upload, 20 existing)',
        toUpload: 80,
        existing: 20,
        total: 100,
      });
    });

    it('builds uploading progress', () => {
      let result = buildUploadingProgress(25, 80);
      expect(result).toEqual({
        phase: 'uploading',
        message: 'Uploading screenshots',
        current: 25,
        total: 80,
      });
    });

    it('builds completed progress', () => {
      let result = buildCompletedProgress('build-123', 'https://example.com');
      expect(result).toEqual({
        phase: 'completed',
        message: 'Upload completed',
        buildId: 'build-123',
        url: 'https://example.com',
      });
    });
  });

  describe('buildUploadResult', () => {
    it('builds complete result', () => {
      let result = buildUploadResult({
        buildId: 'build-123',
        url: 'https://example.com/builds/123',
        total: 100,
        uploaded: 80,
        skipped: 20,
      });

      expect(result).toEqual({
        success: true,
        buildId: 'build-123',
        url: 'https://example.com/builds/123',
        stats: {
          total: 100,
          uploaded: 80,
          skipped: 20,
        },
      });
    });
  });

  describe('buildWaitResult', () => {
    it('builds result with comparison data', () => {
      let build = {
        id: 'build-123',
        status: 'completed',
        comparisonsTotal: 10,
        comparisonsPassed: 8,
        comparisonsFailed: 2,
        url: 'https://example.com/builds/123',
      };

      let result = buildWaitResult(build);

      expect(result).toEqual({
        status: 'completed',
        build,
        comparisons: 10,
        passedComparisons: 8,
        failedComparisons: 2,
        url: 'https://example.com/builds/123',
      });
    });

    it('defaults comparison values when not present', () => {
      let build = { id: 'build-123', status: 'completed' };
      let result = buildWaitResult(build);

      expect(result.passedComparisons).toBe(0);
      expect(result.failedComparisons).toBe(0);
      expect(result.comparisons).toBeUndefined();
    });

    it('handles missing URL', () => {
      let build = { id: 'build-123', status: 'completed' };
      let result = buildWaitResult(build);

      expect(result.url).toBeUndefined();
    });
  });

  describe('resolveBatchSize', () => {
    it('uses options.batchSize first', () => {
      expect(resolveBatchSize({ batchSize: 25 }, { batchSize: 75 })).toBe(25);
    });

    it('falls back to config.batchSize', () => {
      expect(resolveBatchSize({}, { batchSize: 75 })).toBe(75);
    });

    it('falls back to default', () => {
      expect(resolveBatchSize({}, {})).toBe(DEFAULT_BATCH_SIZE);
    });

    it('handles undefined values', () => {
      expect(resolveBatchSize(undefined, undefined)).toBe(DEFAULT_BATCH_SIZE);
    });
  });

  describe('resolveTimeout', () => {
    it('uses options.timeout first', () => {
      expect(resolveTimeout({ timeout: 5000 }, { timeout: 60000 })).toBe(5000);
    });

    it('falls back to config.timeout', () => {
      expect(resolveTimeout({}, { timeout: 60000 })).toBe(60000);
    });

    it('falls back to default', () => {
      expect(resolveTimeout({}, {})).toBe(DEFAULT_TIMEOUT);
    });
  });

  describe('isTimedOut', () => {
    it('returns false when within timeout', () => {
      let startTime = Date.now();
      expect(isTimedOut(startTime, 10000)).toBe(false);
    });

    it('returns true when past timeout', () => {
      let startTime = Date.now() - 15000;
      expect(isTimedOut(startTime, 10000)).toBe(true);
    });

    it('returns true at exact timeout', () => {
      let startTime = Date.now() - 10000;
      expect(isTimedOut(startTime, 10000)).toBe(true);
    });
  });

  describe('getElapsedTime', () => {
    it('returns elapsed time in ms', () => {
      let startTime = Date.now() - 5000;
      let elapsed = getElapsedTime(startTime);

      expect(elapsed).toBeGreaterThanOrEqual(5000);
      expect(elapsed).toBeLessThan(6000);
    });
  });

  describe('buildScreenshotPattern', () => {
    it('builds glob pattern', () => {
      expect(buildScreenshotPattern('/path/to/screenshots')).toBe(
        '/path/to/screenshots/**/*.png'
      );
    });
  });

  describe('extractStatusCodeFromError', () => {
    it('extracts status code from error message', () => {
      expect(extractStatusCodeFromError('API request failed: 404')).toBe('404');
    });

    it('returns unknown for non-matching message', () => {
      expect(extractStatusCodeFromError('Some other error')).toBe('unknown');
    });

    it('handles null message', () => {
      expect(extractStatusCodeFromError(null)).toBe('unknown');
    });

    it('handles undefined message', () => {
      expect(extractStatusCodeFromError(undefined)).toBe('unknown');
    });
  });
});
