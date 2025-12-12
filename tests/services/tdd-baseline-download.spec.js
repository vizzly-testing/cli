import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TddService } from '../../src/services/tdd-service.js';

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
      getTddBaselines: vi.fn(),
    };
    // biome-ignore lint/complexity/useArrowFunction: Must use function for constructor mock
    ApiService.mockImplementation(function () {
      return mockApiService;
    });

    tddService = new TddService(mockConfig, testDir);
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.fetch?.mockClear?.();
  });

  describe('downloadBaselines', () => {
    it('should download baselines successfully with build ID', async () => {
      // Mock API response - getTddBaselines returns build, screenshots with filenames, and signatureProperties
      const mockTddBaselinesResponse = {
        build: {
          id: 'build123',
          name: 'Test Build',
          status: 'passed',
        },
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
            filename: 'homepage_abc123def456.png',
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
            filename: 'login_789xyz012abc.png',
          },
        ],
        signatureProperties: [],
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

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
      const { writeFileSync } = await import('node:fs');

      // Execute the download
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'build123'
      );

      // Verify API calls - now uses getTddBaselines instead of getBuild
      expect(mockApiService.getTddBaselines).toHaveBeenCalledWith('build123');

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

      // Verify file system operations - filenames come from API response
      const writeFileCalls = writeFileSync.mock.calls;
      const baselineWrites = writeFileCalls.filter(
        call =>
          call[0].includes('.vizzly/baselines/') && call[0].endsWith('.png')
      );
      expect(baselineWrites).toHaveLength(2);
      expect(baselineWrites[0][0]).toContain('homepage_abc123def456.png');
      expect(baselineWrites[1][0]).toContain('login_789xyz012abc.png');

      // Verify baseline data is stored
      expect(tddService.baselineData).toMatchObject({
        buildId: 'build123',
        buildName: 'Test Build',
        environment: 'test',
        branch: 'main',
        threshold: 0.1,
        signatureProperties: [],
        createdAt: expect.any(String),
      });

      // Verify screenshots have correct data with API-provided filenames
      expect(tddService.baselineData.screenshots).toHaveLength(2);
      expect(tddService.baselineData.screenshots[0]).toMatchObject({
        name: 'homepage',
        originalName: 'homepage',
        sha256: 'sha256-homepage',
        id: 'screenshot1',
        originalUrl: 'https://example.com/homepage.png',
        fileSize: 12345,
      });
      expect(tddService.baselineData.screenshots[0].path).toContain(
        'homepage_abc123def456.png'
      );
      expect(tddService.baselineData.screenshots[1]).toMatchObject({
        name: 'login',
        originalName: 'login',
        sha256: 'sha256-login',
        id: 'screenshot2',
        originalUrl: 'https://example.com/login.png',
        fileSize: 67890,
      });
      expect(tddService.baselineData.screenshots[1].path).toContain(
        'login_789xyz012abc.png'
      );

      expect(result).not.toBeNull();
    });

    it('should handle download failures gracefully', async () => {
      // Mock API response - getTddBaselines returns build, screenshots with filenames
      const mockTddBaselinesResponse = {
        build: {
          id: 'build123',
          name: 'Test Build',
          status: 'passed',
        },
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
            filename: 'homepage_abc123def456.png',
          },
        ],
        signatureProperties: [],
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

      // Mock failed fetch response
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      // Should return null on download failure
      const result = await tddService.downloadBaselines(
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
      // Mock API response - getTddBaselines returns build, screenshots with filenames
      const mockTddBaselinesResponse = {
        build: {
          id: 'build123',
          name: 'Test Build',
          status: 'passed',
        },
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
            filename: 'homepage_abc123def456.png',
          },
        ],
        signatureProperties: [],
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

      // Mock fetch that throws timeout error
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      global.fetch.mockRejectedValueOnce(timeoutError);

      // Should return null on timeout error
      const result = await tddService.downloadBaselines(
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

      // Mock getTddBaselines response (now used instead of getBuild)
      const mockTddBaselinesResponse = {
        build: {
          id: 'latest-build-456',
          name: 'Latest Passed Build',
          status: 'passed',
        },
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
            filename: 'dashboard_abc123def456.png',
          },
        ],
        signatureProperties: [],
      };

      mockApiService.getBuilds.mockResolvedValueOnce(mockBuildsResponse);
      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

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
      // Now uses getTddBaselines instead of getBuild
      expect(mockApiService.getTddBaselines).toHaveBeenCalledWith(
        'latest-build-456'
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
      // Mock getTddBaselines response with empty screenshots
      const mockTddBaselinesResponse = {
        build: {
          id: 'empty-build',
          name: 'Empty Build',
          status: 'passed',
        },
        screenshots: [], // No screenshots
        signatureProperties: [],
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

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
      // Mock comparison API response - matches actual API structure
      const mockComparison = {
        id: 'comp123',
        baseline_name: 'profile',
        current_name: 'profile',
        baseline_screenshot: {
          id: 'screenshot1',
          build_id: 'baseline-build-789',
        },
        baseline_screenshot_url: 'https://example.com/profile.png',
      };

      mockApiService.getComparison.mockResolvedValueOnce(mockComparison);

      // Mock successful image download
      const mockImageBuffer = Buffer.from('profile-image-data');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer),
      });

      const { writeFileSync } = await import('node:fs');

      // Execute with comparison ID
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        null,
        'comp123'
      );

      // Verify API calls
      expect(mockApiService.getComparison).toHaveBeenCalledWith('comp123');
      // Should NOT call getTddBaselines when using comparison ID - filename is generated locally
      expect(mockApiService.getTddBaselines).not.toHaveBeenCalled();

      // Verify download
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/profile.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );

      // Verify file saved with hash-based filename (generated locally for comparison path)
      const baselineWrites = writeFileSync.mock.calls.filter(
        call =>
          call[0].includes('.vizzly/baselines/') && call[0].endsWith('.png')
      );
      expect(baselineWrites).toHaveLength(1);
      expect(baselineWrites[0][0]).toMatch(/profile_[a-f0-9]{12}\.png$/);

      expect(result).not.toBeNull();
      expect(tddService.baselineData.buildId).toBe('baseline-build-789');
      expect(tddService.baselineData.screenshots).toHaveLength(1);
      expect(tddService.baselineData.screenshots[0].name).toBe('profile');
    });

    it('should use signatureProperties from API response for variant support', async () => {
      // Mock getTddBaselines response with signatureProperties
      const mockTddBaselinesResponse = {
        build: {
          id: 'build-with-variants',
          name: 'Build With Variants',
          status: 'passed',
        },
        screenshots: [
          {
            name: 'dashboard',
            url: 'https://example.com/dashboard-dark.png',
            original_url: 'https://example.com/dashboard-dark.png',
            sha256: 'sha256-dark',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
            metadata: { theme: 'dark', locale: 'en-US' },
            filename: 'dashboard_dark123abc456.png',
          },
          {
            name: 'dashboard',
            url: 'https://example.com/dashboard-light.png',
            original_url: 'https://example.com/dashboard-light.png',
            sha256: 'sha256-light',
            id: 'screenshot2',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
            metadata: { theme: 'light', locale: 'en-US' },
            filename: 'dashboard_light789xyz012.png',
          },
        ],
        signatureProperties: ['theme'], // Only theme is configured as baseline property
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

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

      const { writeFileSync } = await import('node:fs');

      // Execute the download
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'build-with-variants'
      );

      // Verify signatureProperties was stored
      expect(tddService.signatureProperties).toEqual(['theme']);
      expect(tddService.baselineData.signatureProperties).toEqual(['theme']);

      // Verify screenshots downloaded
      expect(tddService.baselineData.screenshots).toHaveLength(2);

      // Verify files saved with API-provided filenames
      const baselineWrites = writeFileSync.mock.calls.filter(
        call =>
          call[0].includes('.vizzly/baselines/') && call[0].endsWith('.png')
      );
      expect(baselineWrites).toHaveLength(2);
      expect(baselineWrites[0][0]).toContain('dashboard_dark123abc456.png');
      expect(baselineWrites[1][0]).toContain('dashboard_light789xyz012.png');

      expect(result).not.toBeNull();
    });

    it('should handle screenshots with viewport and browser in signature when signatureProperties set', async () => {
      // Mock getTddBaselines response with viewport, browser, and custom signatureProperties
      const mockTddBaselinesResponse = {
        build: {
          id: 'build-full-sig',
          name: 'Full Signature Build',
          status: 'passed',
        },
        screenshots: [
          {
            name: 'homepage',
            url: 'https://example.com/homepage-mobile.png',
            original_url: 'https://example.com/homepage-mobile.png',
            sha256: 'sha256-mobile',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 390,
            height: 844,
            viewport_width: 390,
            browser: 'chromium',
            metadata: { device: 'mobile' },
            filename: 'homepage_mobile123abc.png',
          },
          {
            name: 'homepage',
            url: 'https://example.com/homepage-desktop.png',
            original_url: 'https://example.com/homepage-desktop.png',
            sha256: 'sha256-desktop',
            id: 'screenshot2',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
            viewport_width: 1920,
            browser: 'chromium',
            metadata: { device: 'desktop' },
            filename: 'homepage_desktop456xyz.png',
          },
        ],
        signatureProperties: ['device'],
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

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

      const { writeFileSync } = await import('node:fs');

      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'build-full-sig'
      );

      // Verify screenshots downloaded
      expect(tddService.baselineData.screenshots).toHaveLength(2);

      // Filenames use API-provided format
      const baselineWrites = writeFileSync.mock.calls.filter(
        call =>
          call[0].includes('.vizzly/baselines/') && call[0].endsWith('.png')
      );
      expect(baselineWrites).toHaveLength(2);
      expect(baselineWrites[0][0]).toContain('homepage_mobile123abc.png');
      expect(baselineWrites[1][0]).toContain('homepage_desktop456xyz.png');

      expect(result).not.toBeNull();
    });

    it('should ignore custom properties that are not in signatureProperties', async () => {
      // Mock getTddBaselines response with extra properties not in signatureProperties
      const mockTddBaselinesResponse = {
        build: {
          id: 'build-extra-props',
          name: 'Extra Props Build',
          status: 'passed',
        },
        screenshots: [
          {
            name: 'settings',
            url: 'https://example.com/settings.png',
            original_url: 'https://example.com/settings.png',
            sha256: 'sha256-settings',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
            metadata: {
              theme: 'dark',
              locale: 'en-US', // Not in signatureProperties
              user_role: 'admin', // Not in signatureProperties
            },
            filename: 'settings_abc123def456.png',
          },
        ],
        signatureProperties: ['theme'], // Only theme affects baseline matching
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

      const mockImageBuffer = Buffer.from('fake-image-data');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer),
      });

      const { writeFileSync } = await import('node:fs');

      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'build-extra-props'
      );

      // Verify screenshot downloaded
      expect(tddService.baselineData.screenshots).toHaveLength(1);

      // Filename uses API-provided format
      const baselineWrites = writeFileSync.mock.calls.filter(
        call =>
          call[0].includes('.vizzly/baselines/') && call[0].endsWith('.png')
      );
      expect(baselineWrites).toHaveLength(1);
      expect(baselineWrites[0][0]).toContain('settings_abc123def456.png');

      expect(result).not.toBeNull();
    });

    it('should handle empty signatureProperties gracefully', async () => {
      // Mock getTddBaselines response with empty signatureProperties (default behavior)
      const mockTddBaselinesResponse = {
        build: {
          id: 'build-no-props',
          name: 'No Custom Props Build',
          status: 'passed',
        },
        screenshots: [
          {
            name: 'about',
            url: 'https://example.com/about.png',
            original_url: 'https://example.com/about.png',
            sha256: 'sha256-about',
            id: 'screenshot1',
            file_size_bytes: 12345,
            width: 1920,
            height: 1080,
            metadata: { theme: 'dark' }, // Has metadata but not used
            filename: 'about_abc123def456.png',
          },
        ],
        signatureProperties: [], // Empty - no custom properties affect matching
      };

      mockApiService.getTddBaselines.mockResolvedValueOnce(
        mockTddBaselinesResponse
      );

      const mockImageBuffer = Buffer.from('fake-image-data');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer),
      });

      const { writeFileSync } = await import('node:fs');

      const result = await tddService.downloadBaselines(
        'test',
        'main',
        'build-no-props'
      );

      // signatureProperties should be empty
      expect(tddService.signatureProperties).toEqual([]);

      // Verify screenshot downloaded
      expect(tddService.baselineData.screenshots).toHaveLength(1);

      // Filename uses API-provided format
      const baselineWrites = writeFileSync.mock.calls.filter(
        call =>
          call[0].includes('.vizzly/baselines/') && call[0].endsWith('.png')
      );
      expect(baselineWrites).toHaveLength(1);
      expect(baselineWrites[0][0]).toContain('about_abc123def456.png');

      expect(result).not.toBeNull();
    });
  });
});
