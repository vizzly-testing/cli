import assert from 'node:assert';
import { describe, it } from 'node:test';
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
      assert.strictEqual(DEFAULT_BATCH_SIZE, 50);
      assert.strictEqual(DEFAULT_SHA_CHECK_BATCH_SIZE, 100);
      assert.strictEqual(DEFAULT_TIMEOUT, 30000);
    });
  });

  describe('validateApiKey', () => {
    it('returns valid for present API key', () => {
      let result = validateApiKey('test-api-key');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid for missing API key', () => {
      let result = validateApiKey(undefined);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'API key is required');
    });

    it('returns invalid for empty API key', () => {
      let result = validateApiKey('');
      assert.strictEqual(result.valid, false);
    });

    it('returns invalid for null API key', () => {
      let result = validateApiKey(null);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('validateScreenshotsDir', () => {
    it('returns valid for present directory', () => {
      let result = validateScreenshotsDir('/path/to/screenshots');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid for missing directory', () => {
      let result = validateScreenshotsDir(undefined);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Screenshots directory is required');
    });

    it('returns invalid for empty directory', () => {
      let result = validateScreenshotsDir('');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('validateDirectoryStats', () => {
    it('returns valid for directory', () => {
      let stats = { isDirectory: () => true };
      let result = validateDirectoryStats(stats, '/path');
      assert.strictEqual(result.valid, true);
    });

    it('returns invalid for non-directory', () => {
      let stats = { isDirectory: () => false };
      let result = validateDirectoryStats(stats, '/path/file.txt');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, '/path/file.txt is not a directory');
    });
  });

  describe('validateFilesFound', () => {
    it('returns valid for non-empty files array', () => {
      let result = validateFilesFound(['file1.png', 'file2.png'], '/dir');
      assert.strictEqual(result.valid, true);
    });

    it('returns invalid for empty files array', () => {
      let result = validateFilesFound([], '/screenshots');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'No screenshot files found');
      assert.deepStrictEqual(result.context, {
        directory: '/screenshots',
        pattern: '**/*.png',
      });
    });

    it('returns invalid for null files', () => {
      let result = validateFilesFound(null, '/dir');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('extractBrowserFromFilename', () => {
    it('extracts chrome from filename', () => {
      assert.strictEqual(extractBrowserFromFilename('homepage-chrome.png'), 'chrome');
    });

    it('extracts firefox from filename', () => {
      assert.strictEqual(
        extractBrowserFromFilename('login-firefox-1920.png'),
        'firefox'
      );
    });

    it('extracts safari from filename', () => {
      assert.strictEqual(extractBrowserFromFilename('Safari_Dashboard.png'), 'safari');
    });

    it('extracts edge from filename', () => {
      assert.strictEqual(extractBrowserFromFilename('test-edge-mobile.png'), 'edge');
    });

    it('extracts webkit from filename', () => {
      assert.strictEqual(extractBrowserFromFilename('webkit-test.png'), 'webkit');
    });

    it('returns null for unknown browser', () => {
      assert.strictEqual(extractBrowserFromFilename('screenshot.png'), null);
    });

    it('is case insensitive', () => {
      assert.strictEqual(extractBrowserFromFilename('CHROME-TEST.PNG'), 'chrome');
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

      assert.deepStrictEqual(result, {
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

      assert.strictEqual(result.branch, 'develop');
      assert.strictEqual(result.environment, 'production');
      assert.ok(result.name.match(/^Upload \d{4}-\d{2}-\d{2}/));
    });

    it('falls back to main when no default branch', () => {
      let result = buildBuildInfo({}, null);
      assert.strictEqual(result.branch, 'main');
    });
  });

  describe('computeSha256', () => {
    it('computes correct SHA256 hash', () => {
      let buffer = Buffer.from('test content');
      let hash = computeSha256(buffer);

      assert.strictEqual(
        hash,
        '6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72'
      );
    });

    it('returns different hashes for different content', () => {
      let hash1 = computeSha256(Buffer.from('content1'));
      let hash2 = computeSha256(Buffer.from('content2'));

      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('buildFileMetadata', () => {
    it('builds metadata object', () => {
      let buffer = Buffer.from('test');
      let result = buildFileMetadata('/path/to/test.png', buffer);

      assert.strictEqual(result.path, '/path/to/test.png');
      assert.strictEqual(result.filename, 'test.png');
      assert.strictEqual(result.buffer, buffer);
      assert.strictEqual(result.sha256, computeSha256(buffer));
    });
  });

  describe('fileToScreenshotFormat', () => {
    it('converts file metadata to screenshot format', () => {
      let file = {
        sha256: 'abc123',
        filename: 'homepage-chrome.png',
      };

      let result = fileToScreenshotFormat(file);

      assert.deepStrictEqual(result, {
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
      assert.strictEqual(result.browser, 'chrome');
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

      assert.strictEqual(result.toUpload.length, 2);
      assert.strictEqual(result.existing.length, 1);
      assert.deepStrictEqual(
        result.toUpload.map(f => f.sha256),
        ['aaa', 'ccc']
      );
      assert.deepStrictEqual(
        result.existing.map(f => f.sha256),
        ['bbb']
      );
    });

    it('handles empty existing set', () => {
      let files = [{ sha256: 'aaa', filename: 'a.png' }];
      let result = partitionFilesByExistence(files, new Set());

      assert.strictEqual(result.toUpload.length, 1);
      assert.strictEqual(result.existing.length, 0);
    });
  });

  describe('progress builders', () => {
    it('builds scanning progress', () => {
      let result = buildScanningProgress(100);
      assert.deepStrictEqual(result, {
        phase: 'scanning',
        message: 'Found 100 screenshots',
        total: 100,
      });
    });

    it('builds processing progress', () => {
      let result = buildProcessingProgress(50, 100);
      assert.deepStrictEqual(result, {
        phase: 'processing',
        message: 'Processing files',
        current: 50,
        total: 100,
      });
    });

    it('builds deduplication progress', () => {
      let result = buildDeduplicationProgress(80, 20, 100);
      assert.deepStrictEqual(result, {
        phase: 'deduplication',
        message: 'Checking for duplicates (80 to upload, 20 existing)',
        toUpload: 80,
        existing: 20,
        total: 100,
      });
    });

    it('builds uploading progress', () => {
      let result = buildUploadingProgress(25, 80);
      assert.deepStrictEqual(result, {
        phase: 'uploading',
        message: 'Uploading screenshots',
        current: 25,
        total: 80,
      });
    });

    it('builds completed progress', () => {
      let result = buildCompletedProgress('build-123', 'https://example.com');
      assert.deepStrictEqual(result, {
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

      assert.deepStrictEqual(result, {
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

      assert.deepStrictEqual(result, {
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

      assert.strictEqual(result.passedComparisons, 0);
      assert.strictEqual(result.failedComparisons, 0);
      assert.strictEqual(result.comparisons, undefined);
    });

    it('handles missing URL', () => {
      let build = { id: 'build-123', status: 'completed' };
      let result = buildWaitResult(build);

      assert.strictEqual(result.url, undefined);
    });
  });

  describe('resolveBatchSize', () => {
    it('uses options.batchSize first', () => {
      assert.strictEqual(resolveBatchSize({ batchSize: 25 }, { batchSize: 75 }), 25);
    });

    it('falls back to config.batchSize', () => {
      assert.strictEqual(resolveBatchSize({}, { batchSize: 75 }), 75);
    });

    it('falls back to default', () => {
      assert.strictEqual(resolveBatchSize({}, {}), DEFAULT_BATCH_SIZE);
    });

    it('handles undefined values', () => {
      assert.strictEqual(resolveBatchSize(undefined, undefined), DEFAULT_BATCH_SIZE);
    });
  });

  describe('resolveTimeout', () => {
    it('uses options.timeout first', () => {
      assert.strictEqual(resolveTimeout({ timeout: 5000 }, { timeout: 60000 }), 5000);
    });

    it('falls back to config.timeout', () => {
      assert.strictEqual(resolveTimeout({}, { timeout: 60000 }), 60000);
    });

    it('falls back to default', () => {
      assert.strictEqual(resolveTimeout({}, {}), DEFAULT_TIMEOUT);
    });
  });

  describe('isTimedOut', () => {
    it('returns false when within timeout', () => {
      let startTime = Date.now();
      assert.strictEqual(isTimedOut(startTime, 10000), false);
    });

    it('returns true when past timeout', () => {
      let startTime = Date.now() - 15000;
      assert.strictEqual(isTimedOut(startTime, 10000), true);
    });

    it('returns true at exact timeout', () => {
      let startTime = Date.now() - 10000;
      assert.strictEqual(isTimedOut(startTime, 10000), true);
    });
  });

  describe('getElapsedTime', () => {
    it('returns elapsed time in ms', () => {
      let startTime = Date.now() - 5000;
      let elapsed = getElapsedTime(startTime);

      assert.ok(elapsed >= 5000);
      assert.ok(elapsed < 6000);
    });
  });

  describe('buildScreenshotPattern', () => {
    it('builds glob pattern', () => {
      assert.strictEqual(
        buildScreenshotPattern('/path/to/screenshots'),
        '/path/to/screenshots/**/*.png'
      );
    });
  });

  describe('extractStatusCodeFromError', () => {
    it('extracts status code from error message', () => {
      assert.strictEqual(extractStatusCodeFromError('API request failed: 404'), '404');
    });

    it('returns unknown for non-matching message', () => {
      assert.strictEqual(extractStatusCodeFromError('Some other error'), 'unknown');
    });

    it('handles null message', () => {
      assert.strictEqual(extractStatusCodeFromError(null), 'unknown');
    });

    it('handles undefined message', () => {
      assert.strictEqual(extractStatusCodeFromError(undefined), 'unknown');
    });
  });
});
