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
      const { writeFileSync } = await import('node:fs');

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

      // Verify file system operations - filenames now include empty position placeholders
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'homepage__.png'),
        mockImageBuffer
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'login__.png'),
        mockImageBuffer
      );

      // Verify baseline data is stored - signatures include empty placeholders
      expect(tddService.baselineData).toEqual({
        buildId: 'build123',
        buildName: 'Test Build',
        environment: 'test',
        branch: 'main',
        threshold: 0.1,
        signatureProperties: [],
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
            originalName: 'homepage',
            sha256: 'sha256-homepage',
            id: 'screenshot1',
            properties: {},
            path: join(testDir, '.vizzly', 'baselines', 'homepage__.png'),
            signature: 'homepage||',
            originalUrl: 'https://example.com/homepage.png',
            fileSize: 12345,
            dimensions: {
              width: 1920,
              height: 1080,
            },
          },
          {
            name: 'login',
            originalName: 'login',
            sha256: 'sha256-login',
            id: 'screenshot2',
            properties: {},
            path: join(testDir, '.vizzly', 'baselines', 'login__.png'),
            signature: 'login||',
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

      // Execute with comparison ID
      const result = await tddService.downloadBaselines(
        'test',
        'main',
        null,
        'comp123'
      );

      // Verify API calls
      expect(mockApiService.getComparison).toHaveBeenCalledWith('comp123');
      // Should NOT call getBuild when using comparison ID - we create a mock build
      expect(mockApiService.getBuild).not.toHaveBeenCalled();

      // Verify download
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/profile.png',
        expect.objectContaining({
          signal: expect.any(globalThis.AbortSignal),
        })
      );

      expect(result).not.toBeNull();
      expect(tddService.baselineData.buildId).toBe('baseline-build-789');
      expect(tddService.baselineData.screenshots).toHaveLength(1);
      expect(tddService.baselineData.screenshots[0].name).toBe('profile');
    });

    it('should use signatureProperties from API response for variant support', async () => {
      // Mock API response with signatureProperties (baseline_signature_properties from project settings)
      const mockBuildWithScreenshots = {
        id: 'build-with-variants',
        name: 'Build With Variants',
        status: 'passed',
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
          },
        ],
        signatureProperties: ['theme'], // Only theme is configured as baseline property
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

      // Verify screenshots have different signatures based on theme
      // Signature format: name|viewport_width|browser|custom_props
      // When viewport_width and browser are empty, they're placeholders
      expect(tddService.baselineData.screenshots).toHaveLength(2);
      expect(tddService.baselineData.screenshots[0].signature).toBe(
        'dashboard|||dark'
      );
      expect(tddService.baselineData.screenshots[1].signature).toBe(
        'dashboard|||light'
      );

      // Verify files saved with variant-aware filenames (underscores for empty positions)
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'dashboard___dark.png'),
        mockImageBuffer
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'dashboard___light.png'),
        mockImageBuffer
      );

      expect(result).not.toBeNull();
    });

    it('should handle screenshots with viewport and browser in signature when signatureProperties set', async () => {
      // Mock API response with viewport, browser, and custom signatureProperties
      const mockBuildWithScreenshots = {
        id: 'build-full-sig',
        name: 'Full Signature Build',
        status: 'passed',
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
          },
        ],
        signatureProperties: ['device'],
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuildWithScreenshots);

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

      // Signatures should include name|viewport|browser|device
      expect(tddService.baselineData.screenshots[0].signature).toBe(
        'homepage|390|chromium|mobile'
      );
      expect(tddService.baselineData.screenshots[1].signature).toBe(
        'homepage|1920|chromium|desktop'
      );

      // Filenames sanitized from signatures
      expect(writeFileSync).toHaveBeenCalledWith(
        join(
          testDir,
          '.vizzly',
          'baselines',
          'homepage_390_chromium_mobile.png'
        ),
        mockImageBuffer
      );
      expect(writeFileSync).toHaveBeenCalledWith(
        join(
          testDir,
          '.vizzly',
          'baselines',
          'homepage_1920_chromium_desktop.png'
        ),
        mockImageBuffer
      );

      expect(result).not.toBeNull();
    });

    it('should ignore custom properties that are not in signatureProperties', async () => {
      // Mock API response with extra properties not in signatureProperties
      const mockBuildWithScreenshots = {
        id: 'build-extra-props',
        name: 'Extra Props Build',
        status: 'passed',
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
          },
        ],
        signatureProperties: ['theme'], // Only theme affects baseline matching
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuildWithScreenshots);

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

      // Signature should include default props (empty) + theme, not locale or user_role
      // Format: name|viewport_width|browser|theme
      expect(tddService.baselineData.screenshots[0].signature).toBe(
        'settings|||dark'
      );

      // Filename should match signature (underscores for empty positions)
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'settings___dark.png'),
        mockImageBuffer
      );

      expect(result).not.toBeNull();
    });

    it('should handle empty signatureProperties gracefully', async () => {
      // Mock API response with empty signatureProperties (default behavior)
      const mockBuildWithScreenshots = {
        id: 'build-no-props',
        name: 'No Custom Props Build',
        status: 'passed',
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
          },
        ],
        signatureProperties: [], // Empty - no custom properties affect matching
      };

      mockApiService.getBuild.mockResolvedValueOnce(mockBuildWithScreenshots);

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

      // Signature includes empty placeholders for default properties (viewport_width, browser)
      expect(tddService.signatureProperties).toEqual([]);
      expect(tddService.baselineData.screenshots[0].signature).toBe('about||');

      // Filename includes empty position underscores
      expect(writeFileSync).toHaveBeenCalledWith(
        join(testDir, '.vizzly', 'baselines', 'about__.png'),
        mockImageBuffer
      );

      expect(result).not.toBeNull();
    });
  });
});
