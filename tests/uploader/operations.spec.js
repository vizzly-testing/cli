import { describe, expect, it, vi } from 'vitest';
import {
  checkExistingFiles,
  findScreenshots,
  processFiles,
  uploadFiles,
  waitForBuild,
} from '../../src/uploader/operations.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockOutput() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockError(message, code, context) {
  let error = new Error(message);
  error.code = code;
  if (context) error.context = context;
  return error;
}

function createMockClient() {
  return {
    request: vi.fn(),
  };
}

function createAbortSignal(aborted = false) {
  return { aborted };
}

// ============================================================================
// Tests
// ============================================================================

describe('uploader/operations', () => {
  describe('findScreenshots', () => {
    it('finds screenshots using glob', async () => {
      let glob = vi
        .fn()
        .mockResolvedValue(['/path/screenshot1.png', '/path/screenshot2.png']);

      let result = await findScreenshots({
        directory: '/path',
        deps: { glob },
      });

      expect(glob).toHaveBeenCalledWith('/path/**/*.png', { absolute: true });
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no files found', async () => {
      let glob = vi.fn().mockResolvedValue([]);

      let result = await findScreenshots({
        directory: '/empty',
        deps: { glob },
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('processFiles', () => {
    it('processes files and computes hashes', async () => {
      let files = ['/path/a.png', '/path/b.png'];
      let readFile = vi
        .fn()
        .mockResolvedValueOnce(Buffer.from('content1'))
        .mockResolvedValueOnce(Buffer.from('content2'));
      let onProgress = vi.fn();

      let result = await processFiles({
        files,
        signal: createAbortSignal(),
        onProgress,
        deps: { readFile, createError: createMockError },
      });

      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('a.png');
      expect(result[0].sha256).toBeTruthy();
      expect(result[1].filename).toBe('b.png');
      expect(onProgress).toHaveBeenCalled();
    });

    it('throws when signal is aborted', async () => {
      let files = ['/path/a.png'];

      await expect(
        processFiles({
          files,
          signal: createAbortSignal(true),
          onProgress: vi.fn(),
          deps: { readFile: vi.fn(), createError: createMockError },
        })
      ).rejects.toThrow('Operation cancelled');
    });

    it('reports progress every 10 files', async () => {
      let files = Array.from({ length: 25 }, (_, i) => `/path/file${i}.png`);
      let readFile = vi.fn().mockResolvedValue(Buffer.from('content'));
      let onProgress = vi.fn();

      await processFiles({
        files,
        signal: createAbortSignal(),
        onProgress,
        deps: { readFile, createError: createMockError },
      });

      // Progress called at 10, 20, and 25
      expect(onProgress).toHaveBeenCalledWith(10);
      expect(onProgress).toHaveBeenCalledWith(20);
      expect(onProgress).toHaveBeenCalledWith(25);
    });
  });

  describe('checkExistingFiles', () => {
    it('partitions files by existence', async () => {
      let fileMetadata = [
        { sha256: 'aaa', filename: 'a.png' },
        { sha256: 'bbb', filename: 'b.png' },
        { sha256: 'ccc', filename: 'c.png' },
      ];
      let checkShas = vi.fn().mockResolvedValue({
        existing: ['bbb'],
        screenshots: [{ id: 'screenshot-1' }],
      });

      let result = await checkExistingFiles({
        fileMetadata,
        client: createMockClient(),
        signal: createAbortSignal(),
        buildId: 'build-123',
        deps: {
          checkShas,
          createError: createMockError,
          output: createMockOutput(),
        },
      });

      expect(result.toUpload).toHaveLength(2);
      expect(result.existing).toHaveLength(1);
      expect(result.screenshots).toHaveLength(1);
    });

    it('continues without deduplication on error', async () => {
      let fileMetadata = [{ sha256: 'aaa', filename: 'a.png' }];
      let checkShas = vi.fn().mockRejectedValue(new Error('Network error'));
      let output = createMockOutput();

      let result = await checkExistingFiles({
        fileMetadata,
        client: createMockClient(),
        signal: createAbortSignal(),
        buildId: 'build-123',
        deps: { checkShas, createError: createMockError, output },
      });

      // All files should be marked as needing upload
      expect(result.toUpload).toHaveLength(1);
      expect(result.existing).toHaveLength(0);
      expect(output.debug).toHaveBeenCalled();
    });

    it('throws when signal is aborted', async () => {
      await expect(
        checkExistingFiles({
          fileMetadata: [{ sha256: 'aaa', filename: 'a.png' }],
          client: createMockClient(),
          signal: createAbortSignal(true),
          buildId: 'build-123',
          deps: {
            checkShas: vi.fn(),
            createError: createMockError,
            output: createMockOutput(),
          },
        })
      ).rejects.toThrow('Operation cancelled');
    });
  });

  describe('uploadFiles', () => {
    it('returns early when nothing to upload', async () => {
      let result = await uploadFiles({
        toUpload: [],
        buildId: 'build-123',
        client: createMockClient(),
        signal: createAbortSignal(),
        batchSize: 50,
        onProgress: vi.fn(),
        deps: { createError: createMockError },
      });

      expect(result).toEqual({ buildId: 'build-123', url: null });
    });

    it('uploads files in batches', async () => {
      let toUpload = [
        { filename: 'a.png', buffer: Buffer.from('a') },
        { filename: 'b.png', buffer: Buffer.from('b') },
        { filename: 'c.png', buffer: Buffer.from('c') },
      ];
      let client = createMockClient();
      client.request.mockResolvedValue({ url: 'https://example.com' });
      let onProgress = vi.fn();

      let result = await uploadFiles({
        toUpload,
        buildId: 'build-123',
        client,
        signal: createAbortSignal(),
        batchSize: 2,
        onProgress,
        deps: { createError: createMockError },
      });

      // Should make 2 requests (2 files + 1 file)
      expect(client.request).toHaveBeenCalledTimes(2);
      expect(result.url).toBe('https://example.com');
    });

    it('throws when signal is aborted', async () => {
      await expect(
        uploadFiles({
          toUpload: [{ filename: 'a.png', buffer: Buffer.from('a') }],
          buildId: 'build-123',
          client: createMockClient(),
          signal: createAbortSignal(true),
          batchSize: 50,
          onProgress: vi.fn(),
          deps: { createError: createMockError },
        })
      ).rejects.toThrow('Operation cancelled');
    });

    it('throws on upload failure', async () => {
      let client = createMockClient();
      client.request.mockRejectedValue(new Error('Network error'));

      await expect(
        uploadFiles({
          toUpload: [{ filename: 'a.png', buffer: Buffer.from('a') }],
          buildId: 'build-123',
          client,
          signal: createAbortSignal(),
          batchSize: 50,
          onProgress: vi.fn(),
          deps: { createError: createMockError },
        })
      ).rejects.toThrow('Upload failed: Network error');
    });
  });

  describe('waitForBuild', () => {
    it('returns when build completes', async () => {
      let client = createMockClient();
      client.request.mockResolvedValue({
        build: {
          id: 'build-123',
          status: 'completed',
          comparisonsTotal: 10,
          comparisonsPassed: 8,
          comparisonsFailed: 2,
          url: 'https://example.com',
        },
      });

      let result = await waitForBuild({
        buildId: 'build-123',
        timeout: 5000,
        signal: createAbortSignal(),
        client,
        deps: {
          createError: createMockError,
          createTimeoutError: createMockError,
        },
      });

      expect(result.status).toBe('completed');
      expect(result.comparisons).toBe(10);
      expect(result.passedComparisons).toBe(8);
      expect(result.failedComparisons).toBe(2);
    });

    it('throws when build fails', async () => {
      let client = createMockClient();
      client.request.mockResolvedValue({
        build: {
          id: 'build-123',
          status: 'failed',
          error: 'Processing failed',
        },
      });

      await expect(
        waitForBuild({
          buildId: 'build-123',
          timeout: 5000,
          signal: createAbortSignal(),
          client,
          deps: {
            createError: createMockError,
            createTimeoutError: createMockError,
          },
        })
      ).rejects.toThrow('Build failed: Processing failed');
    });

    it('throws when signal is aborted', async () => {
      await expect(
        waitForBuild({
          buildId: 'build-123',
          timeout: 5000,
          signal: createAbortSignal(true),
          client: createMockClient(),
          deps: {
            createError: createMockError,
            createTimeoutError: createMockError,
          },
        })
      ).rejects.toThrow('Operation cancelled');
    });

    it('throws on API request failure', async () => {
      let client = createMockClient();
      client.request.mockRejectedValue(new Error('API request failed: 404'));

      await expect(
        waitForBuild({
          buildId: 'build-123',
          timeout: 5000,
          signal: createAbortSignal(),
          client,
          deps: {
            createError: createMockError,
            createTimeoutError: createMockError,
          },
        })
      ).rejects.toThrow('Failed to check build status: 404');
    });

    it('throws timeout error when build takes too long', async () => {
      let client = createMockClient();
      // Always return pending status
      client.request.mockResolvedValue({
        build: { id: 'build-123', status: 'pending' },
      });

      await expect(
        waitForBuild({
          buildId: 'build-123',
          timeout: 1, // Very short timeout
          signal: createAbortSignal(),
          client,
          deps: {
            createError: createMockError,
            createTimeoutError: createMockError,
          },
        })
      ).rejects.toThrow('Build timed out after 1ms');
    });

    it('handles direct build response (without wrapper)', async () => {
      let client = createMockClient();
      client.request.mockResolvedValue({
        id: 'build-123',
        status: 'completed',
        url: 'https://example.com',
      });

      let result = await waitForBuild({
        buildId: 'build-123',
        timeout: 5000,
        signal: createAbortSignal(),
        client,
        deps: {
          createError: createMockError,
          createTimeoutError: createMockError,
        },
      });

      expect(result.status).toBe('completed');
    });
  });
});
