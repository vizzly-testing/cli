import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
global.fetch = vi.fn();

describe('Run Command waitForBuild Exit Code Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('waitForBuild exit code behavior', () => {
    it('should return failedComparisons when build has failed comparisons', async () => {
      // Import the createUploader function to test the waitForBuild method directly
      const { createUploader } = await import('../../src/services/uploader.js');

      const config = {
        apiKey: 'test-api-key',
        apiUrl: 'https://api.test.com',
        command: 'run',
      };

      const uploader = createUploader(config);

      // Mock API response with failed comparisons
      const mockBuildResponse = {
        build: {
          id: 'build-123',
          status: 'completed',
          comparisonsTotal: 5,
          comparisonsCompleted: 5,
          comparisonsPassed: 3,
          comparisonsFailed: 2,
          url: 'https://app.vizzly.dev/builds/build-123',
        },
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBuildResponse),
      });

      const result = await uploader.waitForBuild('build-123');

      // Verify that failedComparisons is properly extracted
      expect(result.failedComparisons).toBe(2);
      expect(result.passedComparisons).toBe(3);
      expect(result.comparisons).toBe(5);
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://app.vizzly.dev/builds/build-123');
    });

    it('should handle missing comparison data gracefully', async () => {
      // This test demonstrates the bug when comparison data is missing
      const { createUploader } = await import('../../src/services/uploader.js');

      const config = {
        apiKey: 'test-api-key',
        apiUrl: 'https://api.test.com',
        command: 'run',
      };

      const uploader = createUploader(config);

      // Mock API response without comparison data (simulates the bug)
      const mockBuildResponse = {
        build: {
          id: 'build-123',
          status: 'completed',
          url: 'https://app.vizzly.dev/builds/build-123',
          // Missing comparisonsTotal, comparisonsPassed, comparisonsFailed
        },
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBuildResponse),
      });

      const result = await uploader.waitForBuild('build-123');

      // With the current implementation, failedComparisons should be 0 when missing
      // This ensures the check `buildResult.failedComparisons > 0` works correctly
      expect(result.failedComparisons).toBe(0);
      expect(result.passedComparisons).toBe(0);
      expect(result.comparisons).toBeUndefined();
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://app.vizzly.dev/builds/build-123');
    });

    it('should demonstrate the run command exit code logic', () => {
      // This test demonstrates the exact logic that should trigger exit code 1
      const buildResultWithFailures = {
        status: 'completed',
        failedComparisons: 2,
        passedComparisons: 3,
        comparisons: 5,
      };

      const buildResultWithoutFailures = {
        status: 'completed',
        failedComparisons: 0,
        passedComparisons: 5,
        comparisons: 5,
      };

      const buildResultMissingData = {
        status: 'completed',
        // Missing failedComparisons - this would be undefined
      };

      // This is the exact check from the run command
      expect(buildResultWithFailures.failedComparisons > 0).toBe(true);
      expect(buildResultWithoutFailures.failedComparisons > 0).toBe(false);

      // This demonstrates the bug - undefined > 0 is false, so no exit code 1
      expect(buildResultMissingData.failedComparisons > 0).toBe(false);
      expect(buildResultMissingData.failedComparisons).toBe(undefined);
    });

    it('should simulate the exact user scenario with visual differences', async () => {
      const { createUploader } = await import('../../src/services/uploader.js');

      const config = {
        apiKey: 'test-api-key',
        apiUrl: 'https://vizzly.dev',
        command: 'run',
      };

      const uploader = createUploader(config);

      // Mock API response that simulates a build with visual differences
      const mockBuildResponse = {
        build: {
          id: '7b3732a2-59e9-43f8-8378-63b9c9196c59',
          status: 'completed',
          comparisonsTotal: 26,
          comparisonsCompleted: 26,
          comparisonsPassed: 24,
          comparisonsFailed: 2, // Visual differences detected
          url: 'https://vizzly.dev/vizzly/pitstop/builds/7b3732a2-59e9-43f8-8378-63b9c9196c59',
        },
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBuildResponse),
      });

      const result = await uploader.waitForBuild(
        '7b3732a2-59e9-43f8-8378-63b9c9196c59'
      );

      // Verify that failedComparisons is properly extracted and would trigger exit code 1
      expect(result.failedComparisons).toBe(2);
      expect(result.failedComparisons > 0).toBe(true); // This should trigger exit code 1
      expect(result.passedComparisons).toBe(24);
      expect(result.comparisons).toBe(26);
      expect(result.status).toBe('completed');
      expect(result.url).toBe(
        'https://vizzly.dev/vizzly/pitstop/builds/7b3732a2-59e9-43f8-8378-63b9c9196c59'
      );
    });
  });
});
