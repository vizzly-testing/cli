import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TddService } from '../../src/services/tdd-service.js';
import { join } from 'path';
import { tmpdir } from 'os';

// Don't mock fetch-utils - we want to test it!
// Mock fs for file operations but keep functionality testable
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));
vi.mock('../../src/services/api-service.js');
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));
vi.mock('../../src/utils/git.js', () => ({
  getDefaultBranch: vi.fn(() => Promise.resolve('main')),
}));

// Mock global fetch to simulate network responses
global.fetch = vi.fn();

describe('TDD Service - Baseline Download', () => {
  let tddService;
  let mockConfig;
  let testDir;
  let mockApiService;

  beforeEach(async () => {
    vi.clearAllMocks();

    testDir = join(tmpdir(), `vizzly-test-${Date.now()}`);

    mockConfig = {
      apiUrl: 'https://test.vizzly.com',
      apiKey: 'test-api-key',
      comparison: {
        threshold: 0.1,
      },
    };

    // Setup API service mock
    const { ApiService } = await import('../../src/services/api-service.js');
    mockApiService = {
      getBuild: vi.fn(),
      getBuilds: vi.fn(),
      getComparison: vi.fn(),
    };
    ApiService.mockReturnValue(mockApiService);

    tddService = new TddService(mockConfig, testDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.fetch?.mockClear?.();
  });

  describe('downloadBaselines', () => {
    it('should download baselines successfully with build ID', async () => {
      // Mock API response - getBuild with 'screenshots' parameter returns full build details
      const mockBuildWithScreenshots = {
        id: 'build123',
        name: 'Test Build',
        status: 'passed',
        screenshots: [
          {
            name: 'homepage',
            url: 'https://example.com/homepage.png',
            original_url: 'https://example.com/homepage.png',
            sha256: 'sha256-homepage',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
          },
          {
            name: 'login',
            url: 'https://example.com/login.png',
            original_url: 'https://example.com/login.png',
            sha256: 'sha256-login',
            id: 'screenshot2',
            file_size_bytes: 67890,
            width: 1920,
            height: 1080,
          },
        ],
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuildWithScreenshots);

      // Mock fetch responses for image downloads
      const mockImageBuffer = Buffer.from('fake-image-data');

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockImageBuffer),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockImageBuffer),
        });

      // Mock filesystem operations
      const { writeFileSync } = await import('fs');

      // Execute the download
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'build123'
      );

      // Verify API calls
      expect(mockApiService.getBuild).toHaveBeenCalledWith(
        'build123',
        'screenshots'
      );

      // Verify fetch calls with timeout
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/homepage.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/login.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );

      // Verify file system operations
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'homepage.png'),
        mockImageBuffer
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'login.png'),
        mockImageBuffer
      );

      // Verify baseline data is stored
      expect(tddService.baselineData).toEqual({
        buildId: 'build123',
        buildName: 'Test Build',
        environment: 'test',
        branch: 'main',
        threshold: 0.1,
        createdAt: expect.any(String),
        buildInfo: {
          commitSha: undefined,
          commitMessage: undefined,
          approvalStatus: undefined,
          completedAt: undefined,
        },
        screenshots: [
          {
            name: 'homepage',
            sha256: 'sha256-homepage',
            id: 'screenshot1',
            properties: {},
            path: join(testDir, '.vizzly', 'baselines', 'homepage.png'),
            originalUrl: 'https://example.com/homepage.png',
            fileSize: 12345,
            dimensions: {
              width: 1920,
              height: 1080,
            },
          },
          {
            name: 'login',
            sha256: 'sha256-login',
            id: 'screenshot2',
            properties: {},
            path: join(testDir, '.vizzly', 'baselines', 'login.png'),
            originalUrl: 'https://example.com/login.png',
            fileSize: 67890,
            dimensions: {
              width: 1920,
              height: 1080,
            },
          },
        ],
      });

      expect(result).not.toBeNull();
    });

    it('should handle download failures gracefully', async () => {
      // Mock API response - getBuild with 'screenshots' parameter returns full build details
      const mockBuildWithScreenshots = {
        id: 'build123',
        name: 'Test Build',
        status: 'passed',
        screenshots: [
          {
            name: 'homepage',
            url: 'https://example.com/homepage.png',
            original_url: 'https://example.com/homepage.png',
            sha256: 'sha256-homepage',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
          },
        ],
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuildWithScreenshots);

      // Mock failed fetch response
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      // Should return null on download failure
      let result = await tddService.downloadBaselines(
        'test',
        'main',
        'build123'
      );
      expect(result).toBeNull();

      // Verify fetch was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/homepage.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );
    });

    it('should handle fetch timeout scenarios', async () => {
      // Mock API response - getBuild with 'screenshots' parameter returns full build details
      const mockBuildWithScreenshots = {
        id: 'build123',
        name: 'Test Build',
        status: 'passed',
        screenshots: [
          {
            name: 'homepage',
            url: 'https://example.com/homepage.png',
            original_url: 'https://example.com/homepage.png',
            sha256: 'sha256-homepage',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
          },
        ],
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuildWithScreenshots);

      // Mock fetch that throws timeout error
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      global.fetch.mockRejectedValueOnce(timeoutError);

      // Should return null on timeout error
      let result = await tddService.downloadBaselines(
        'test',
        'main',
        'build123'
      );
      expect(result).toBeNull();

      // Verify fetch was called with timeout signal
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/homepage.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );
    });

    it('should find baselines using latest passed build when no build ID specified', async () => {
      // Mock API responses for latest build search
      const mockBuildsResponse = {
        data: [
          {
            id: 'latest-build-456',
            name: 'Latest Passed Build',
            status: 'passed',
          },
        ],
      };

      const mockBuildDetails = {
        id: 'latest-build-456',
        screenshots: [
          {
            name: 'dashboard',
            url: 'https://example.com/dashboard.png',
            original_url: 'https://example.com/dashboard.png',
            sha256: 'sha256-dashboard',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
          },
        ],
      };

      mockApiService.getBuilds.mockResolvedValueOnce(mockBuildsResponse);
      mockApiService.getBuild.mockResolvedValueOnce(mockBuildDetails);

      // Mock successful image download
      const mockImageBuffer = Buffer.from('dashboard-image-data');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer),
      });

      // Execute without specifying build ID
      const result = await tddService.downloadBaselines('production', 'main');

      // Verify API calls
      expect(mockApiService.getBuilds).toHaveBeenCalledWith({
        environment: 'production',
        branch: 'main',
        status: 'passed',
        limit: 1,
      });
      expect(mockApiService.getBuild).toHaveBeenCalledWith(
        'latest-build-456',
        'screenshots'
      );

      // Verify download occurred
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/dashboard.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );

      expect(result).not.toBeNull();
      expect(tddService.baselineData.buildId).toBe('latest-build-456');
    });

    it('should handle cases where no baseline builds are found', async () => {
      // Mock empty builds response
      mockApiService.getBuilds.mockResolvedValueOnce({
        data: [],
      });

      // Execute without specifying build ID
      const result = await tddService.downloadBaselines(
        'staging',
        'feature-branch'
      );

      // Verify API call
      expect(mockApiService.getBuilds).toHaveBeenCalledWith({
        environment: 'staging',
        branch: 'feature-branch',
        status: 'passed',
        limit: 1,
      });

      // Should return null when no baselines found
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle builds with no screenshots', async () => {
      // Mock API responses
      const mockBuild = {
        id: 'empty-build',
        name: 'Empty Build',
        status: 'passed',
      };

      const mockBuildDetails = {
        id: 'empty-build',
        screenshots: [], // No screenshots
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuild);
      mockApiService.getBuild.mockResolvedValueOnce(mockBuildDetails);

      // Execute
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'empty-build'
      );

      // Should return null when no screenshots found
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should download baselines using comparison ID', async () => {
      // Mock comparison API response
      const mockComparison = {
        id: 'comp123',
        baselineBuild: {
          id: 'baseline-build-789',
          name: 'Comparison Baseline',
          status: 'passed',
        },
      };

      const mockBuildDetails = {
        id: 'baseline-build-789',
        screenshots: [
          {
            name: 'profile',
            url: 'https://example.com/profile.png',
            original_url: 'https://example.com/profile.png',
            sha256: 'sha256-profile',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
            properties: { viewport: '1920x1080' },
          },
        ],
      };

      mockApiService.getComparison.mockResolvedValueOnce(mockComparison);
      mockApiService.getBuild.mockResolvedValueOnce(mockBuildDetails);

      // Mock successful image download
      const mockImageBuffer = Buffer.from('profile-image-data');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer),
      });

      // Execute with comparison ID
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        null,
        'comp123'
      );

      // Verify API calls
      expect(mockApiService.getComparison).toHaveBeenCalledWith('comp123');
      expect(mockApiService.getBuild).toHaveBeenCalledWith(
        'baseline-build-789',
        'screenshots'
      );

      // Verify download
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/profile.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );

      expect(result).not.toBeNull();
      expect(tddService.baselineData.buildId).toBe('baseline-build-789');
      expect(tddService.baselineData.screenshots[0].properties).toEqual({
        viewport: '1920x1080',
      });
    });
  });
});
