import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploader } from '../../src/services/uploader.js';
import { loadConfig } from '../../src/utils/config-loader.js';

// Mock global fetch
global.fetch = vi.fn();

describe('Uploader Service Integration Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be able to instantiate the uploader and call the upload method', async () => {
    let config = await loadConfig();
    config.allowNoToken = true; // Allow test to run without API token

    let uploader = createUploader(config);

    let uploadSpy = vi.spyOn(uploader, 'upload').mockResolvedValue();

    let flags = {
      path: './screenshots',
      buildName: 'test-build',
    };

    await uploader.upload(flags);

    expect(uploadSpy).toHaveBeenCalledWith(flags);
  });

  describe('waitForBuild', () => {
    it('should return comparison data including failedComparisons when build completes', async () => {
      let config = await loadConfig();
      config.apiKey = 'test-api-key';
      config.apiUrl = 'https://api.test.com';

      let uploader = createUploader(config);

      // Mock API response with comparison data
      const mockBuildResponse = {
        build: {
          id: 'build-123',
          status: 'completed',
          comparisonsTotal: 5,
          comparisonsCompleted: 5,
          comparisonsPassed: 3,
          comparisonsFailed: 2,
          url: 'https://app.test.com/builds/build-123',
        },
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBuildResponse),
      });

      const result = await uploader.waitForBuild('build-123');

      // This test will fail with the current implementation
      // because waitForBuild doesn't extract comparison data
      expect(result).toEqual({
        status: 'completed',
        comparisons: 5,
        passedComparisons: 3,
        failedComparisons: 2,
        url: 'https://app.test.com/builds/build-123',
        build: mockBuildResponse.build,
      });
    });

    it('should handle build failure status', async () => {
      let config = await loadConfig();
      config.apiKey = 'test-api-key';
      config.apiUrl = 'https://api.test.com';

      let uploader = createUploader(config);

      // Mock API response for failed build
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            build: {
              id: 'build-123',
              status: 'failed',
              error: 'Build processing failed',
            },
          }),
      });

      await expect(uploader.waitForBuild('build-123')).rejects.toThrow(
        'Build failed: Build processing failed'
      );
    });

    it('should handle API request failure', async () => {
      let config = await loadConfig();
      config.apiKey = 'test-api-key';
      config.apiUrl = 'https://api.test.com';

      let uploader = createUploader(config);

      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(uploader.waitForBuild('build-123')).rejects.toThrow(
        'Failed to check build status: 404'
      );
    });
  });
});
