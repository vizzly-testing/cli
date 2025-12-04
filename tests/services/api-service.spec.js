import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VizzlyError } from '../../src/errors/vizzly-error.js';
import { ApiService } from '../../src/services/api-service.js';

// Mock global fetch
global.fetch = vi.fn();

describe('ApiService', () => {
  beforeEach(() => {
    // Reset fetch mock
    global.fetch.mockClear();
  });

  describe('ApiService class', () => {
    it('throws error without token', () => {
      expect(() => new ApiService()).toThrow('No API token provided');
    });

    it('creates instance with token', () => {
      const service = new ApiService({
        baseUrl: 'https://test.api.com',
        token: 'test-token',
      });

      expect(service.baseUrl).toBe('https://test.api.com');
      expect(service.token).toBe('test-token');
    });

    it('makes authenticated request', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockData = { success: true };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await service.request('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.vizzly.dev/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it('throws VizzlyError on API failure', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(service.request('/test')).rejects.toThrow(VizzlyError);
    });

    it('creates build with metadata', async () => {
      const service = new ApiService({ token: 'test-token' });
      const metadata = { name: 'Test Build', branch: 'main' };
      const mockBuild = { id: 'build123', ...metadata };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBuild),
      });

      const result = await service.createBuild(metadata);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.vizzly.dev/api/sdk/builds',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ build: metadata }),
        })
      );
      expect(result).toEqual(mockBuild);
    });

    it('uploads screenshot with metadata', async () => {
      const service = new ApiService({ token: 'test-token' });
      const buildId = 'build123';
      const name = 'test-screenshot';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const sha256 = require('node:crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex');
      const metadata = {
        browser: 'chrome',
        viewport: '1920x1080',
        device: 'desktop',
      };
      const mockResponse = { success: true, id: 'screenshot123' };

      // Mock the enhanced SHA check request (no existing files)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            existing: [],
            missing: [sha256],
            summary: {
              total_checked: 1,
              existing_count: 0,
              missing_count: 1,
              screenshots_created: 0,
            },
            screenshots: [],
          }),
      });

      // Mock the upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.uploadScreenshot(
        buildId,
        name,
        buffer,
        metadata
      );

      // Check that SHA check was called first with buildId
      const firstCall = global.fetch.mock.calls[0];
      expect(firstCall[0]).toBe('https://app.vizzly.dev/api/sdk/check-shas');
      expect(firstCall[1].method).toBe('POST');
      const firstRequestBody = JSON.parse(firstCall[1].body);
      expect(firstRequestBody.buildId).toBe(buildId);
      expect(firstRequestBody.screenshots).toEqual([
        {
          sha256,
          name,
          browser: metadata.browser || 'chrome',
          viewport_width: metadata.viewport?.width || 1920,
          viewport_height: metadata.viewport?.height || 1080,
        },
      ]);

      // Check that upload was called with correct data (second call)
      const secondCall = global.fetch.mock.calls[1];
      expect(secondCall[0]).toBe(
        `https://app.vizzly.dev/api/sdk/builds/${buildId}/screenshots`
      );
      const uploadBody = JSON.parse(secondCall[1].body);
      expect(uploadBody.properties).toEqual(metadata);
      expect(result).toEqual(mockResponse);
    });

    it('uploads screenshot with empty metadata when none provided', async () => {
      const service = new ApiService({ token: 'test-token' });
      const buildId = 'build123';
      const name = 'test-screenshot';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const sha256 = require('node:crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex');
      const mockResponse = { success: true, id: 'screenshot123' };

      // Mock the enhanced SHA check request (no existing files)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            existing: [],
            missing: [sha256],
            summary: {
              total_checked: 1,
              existing_count: 0,
              missing_count: 1,
              screenshots_created: 0,
            },
            screenshots: [],
          }),
      });

      // Mock the upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.uploadScreenshot(buildId, name, buffer);

      // Check that SHA check was called with buildId
      const firstCall = global.fetch.mock.calls[0];
      const firstRequestBody = JSON.parse(firstCall[1].body);
      expect(firstRequestBody.buildId).toBe(buildId);
      expect(firstRequestBody.screenshots).toEqual([
        {
          sha256,
          name,
          browser: 'chrome',
          viewport_width: 1920,
          viewport_height: 1080,
        },
      ]);

      // Check that upload was called with empty properties (second call)
      const secondCall = global.fetch.mock.calls[1];
      const uploadBody = JSON.parse(secondCall[1].body);
      expect(uploadBody.properties).toEqual({});
      expect(result).toEqual(mockResponse);
    });

    it('skips upload when SHA already exists', async () => {
      const service = new ApiService({ token: 'test-token' });
      const buildId = 'build123';
      const name = 'test-screenshot';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const sha256 = require('node:crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

      // Mock the enhanced SHA check response with screenshots array
      const mockScreenshot = {
        id: 'screenshot-uuid',
        name: 'test-screenshot',
        sha256,
        fromExisting: true,
        alreadyExisted: false,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            existing: [sha256],
            missing: [],
            summary: {
              total_checked: 1,
              existing_count: 1,
              missing_count: 0,
              screenshots_created: 1,
            },
            screenshots: [mockScreenshot],
          }),
      });

      const result = await service.uploadScreenshot(buildId, name, buffer);

      // Should only call SHA check, not upload
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Verify the request included buildId
      const firstCall = global.fetch.mock.calls[0];
      expect(firstCall[0]).toBe('https://app.vizzly.dev/api/sdk/check-shas');
      const requestBody = JSON.parse(firstCall[1].body);
      expect(requestBody.buildId).toBe(buildId);
      expect(requestBody.screenshots).toEqual([
        {
          sha256,
          name,
          browser: 'chrome',
          viewport_width: 1920,
          viewport_height: 1080,
        },
      ]);

      expect(result).toEqual({
        message: 'Screenshot already exists, skipped upload',
        sha256,
        skipped: true,
        screenshot: mockScreenshot,
        fromExisting: true,
      });
    });
  });

  describe('finalizeParallelBuild', () => {
    it('should make correct API call', async () => {
      const service = new ApiService({ token: 'test-token' });
      const parallelId = 'parallel-123';
      const mockResponse = {
        message: 'Parallel build finalized successfully',
        build: {
          id: 'build-456',
          status: 'completed',
          parallel_id: parallelId,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.finalizeParallelBuild(parallelId);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://app.vizzly.dev/api/sdk/parallel/${parallelId}/finalize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': expect.any(String),
            Authorization: 'Bearer test-token',
          },
        }
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors', async () => {
      const service = new ApiService({ token: 'test-token' });
      const parallelId = 'parallel-123';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Parallel build not found'),
      });

      await expect(service.finalizeParallelBuild(parallelId)).rejects.toThrow(
        VizzlyError
      );
    });
  });

  describe('searchComparisons', () => {
    it('should search comparisons with name only', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockResponse = {
        comparisons: [
          {
            id: 'cmp-123',
            name: 'homepage_desktop',
            status: 'completed',
            diff_percentage: 2.5,
          },
        ],
        pagination: {
          total: 1,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.searchComparisons('homepage_desktop');

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('name=homepage_desktop');
      expect(url).toContain('limit=50'); // Default value
      expect(url).toContain('offset=0'); // Default value
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should search comparisons with all filters', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockResponse = {
        comparisons: [],
        pagination: {
          total: 25,
          limit: 20,
          offset: 10,
          hasMore: true,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.searchComparisons('dashboard', {
        branch: 'main',
        limit: 20,
        offset: 10,
      });

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('name=dashboard');
      expect(url).toContain('branch=main');
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=10');
      expect(result).toEqual(mockResponse);
    });

    it('should search comparisons with only some filters', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockResponse = {
        comparisons: [],
        pagination: {
          total: 0,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.searchComparisons('login', {
        branch: 'feature/auth',
      });

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('name=login');
      expect(url).toContain('branch=feature%2Fauth');
      expect(url).toContain('limit=50'); // Default value applied
      expect(url).toContain('offset=0'); // Default value applied
      expect(result).toEqual(mockResponse);
    });

    it('should throw error for missing name', async () => {
      const service = new ApiService({ token: 'test-token' });

      await expect(service.searchComparisons('')).rejects.toThrow(VizzlyError);
      await expect(service.searchComparisons('')).rejects.toThrow(
        'name is required and must be a non-empty string'
      );
    });

    it('should throw error for invalid name type', async () => {
      const service = new ApiService({ token: 'test-token' });

      await expect(service.searchComparisons(null)).rejects.toThrow(
        VizzlyError
      );
      await expect(service.searchComparisons(undefined)).rejects.toThrow(
        VizzlyError
      );
      await expect(service.searchComparisons(123)).rejects.toThrow(VizzlyError);
    });

    it('should handle limit and offset as zero', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockResponse = {
        comparisons: [],
        pagination: {
          total: 0,
          limit: 0,
          offset: 0,
          hasMore: false,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.searchComparisons('test', {
        limit: 0,
        offset: 0,
      });

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('limit=0');
      expect(url).toContain('offset=0');
      expect(result).toEqual(mockResponse);
    });

    it('should handle API errors', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      await expect(service.searchComparisons('homepage')).rejects.toThrow(
        VizzlyError
      );
    });
  });

  describe('getScreenshotHotspots', () => {
    it('should fetch hotspots for a single screenshot', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockResponse = {
        hotspot_analysis: {
          regions: [
            { y1: 100, y2: 200 },
            { y1: 300, y2: 400 },
          ],
          confidence: 'high',
          confidence_score: 85,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getScreenshotHotspots('homepage_desktop');

      const url = global.fetch.mock.calls[0][0];
      expect(url).toBe(
        'https://app.vizzly.dev/api/sdk/screenshots/homepage_desktop/hotspots?windowSize=20'
      );
      expect(result).toEqual(mockResponse);
    });

    it('should URL-encode screenshot names with special characters', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await service.getScreenshotHotspots('screenshot/with spaces&special');

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('screenshot%2Fwith%20spaces%26special');
    });

    it('should accept custom windowSize', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await service.getScreenshotHotspots('test', { windowSize: 50 });

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('windowSize=50');
    });

    it('should handle API errors', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Screenshot not found'),
      });

      await expect(
        service.getScreenshotHotspots('nonexistent')
      ).rejects.toThrow(VizzlyError);
    });
  });

  describe('getBatchHotspots', () => {
    it('should fetch hotspots for multiple screenshots', async () => {
      const service = new ApiService({ token: 'test-token' });
      const screenshotNames = ['homepage', 'dashboard', 'settings'];
      const mockResponse = {
        hotspots: {
          homepage: {
            regions: [{ y1: 100, y2: 200 }],
            confidence: 'high',
            confidence_score: 90,
          },
          dashboard: {
            regions: [{ y1: 50, y2: 150 }],
            confidence: 'medium',
            confidence_score: 60,
          },
        },
        summary: {
          total_requested: 3,
          with_hotspots: 2,
          without_hotspots: 1,
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getBatchHotspots(screenshotNames);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.vizzly.dev/api/sdk/screenshots/hotspots',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({
            screenshot_names: screenshotNames,
            windowSize: 20,
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should accept custom windowSize', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hotspots: {} }),
      });

      await service.getBatchHotspots(['test'], { windowSize: 100 });

      const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(requestBody.windowSize).toBe(100);
    });

    it('should handle empty response', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            hotspots: {},
            summary: {
              total_requested: 1,
              with_hotspots: 0,
              without_hotspots: 1,
            },
          }),
      });

      const result = await service.getBatchHotspots(['new-screenshot']);

      expect(result.hotspots).toEqual({});
    });

    it('should handle API errors', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      await expect(service.getBatchHotspots(['test'])).rejects.toThrow(
        VizzlyError
      );
    });
  });
});
