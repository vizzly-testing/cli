import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare } from '@vizzly-testing/honeydiff';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TddService } from '../../src/services/tdd-service.js';

// Mock all external dependencies
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('mock-image-data')),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
  exec: vi.fn((_cmd, callback) => callback(null, '', '')),
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
vi.mock('../../src/utils/git.js');
vi.mock('../../src/utils/fetch-utils.js');

// Mock @vizzly-testing/honeydiff dynamic import
vi.mock('@vizzly-testing/honeydiff', () => ({
  compare: vi.fn(async () => ({
    isDifferent: false,
    diffPercentage: 0,
    totalPixels: 1000000,
    diffPixels: 0,
    aaPixelsIgnored: 0,
    aaPercentage: 0,
    boundingBox: null,
    heightDiff: null,
    diffPixelsList: null,
    diffClusters: null,
    intensityStats: null,
    perceptualScore: null,
  })),
}));

describe('TddService', () => {
  let tddService;
  let mockConfig;
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `vizzly-test-${Date.now()}`);

    mockConfig = {
      apiUrl: 'https://test.vizzly.com',
      apiKey: 'test-api-key',
      comparison: {
        threshold: 0.1,
      },
    };

    // Clear all mocks
    vi.clearAllMocks();

    tddService = new TddService(mockConfig, testDir);
  });

  describe('constructor', () => {
    it('initializes with correct configuration', () => {
      expect(tddService.config).toEqual(mockConfig);
      expect(tddService.workingDir).toBe(testDir);
      expect(tddService.threshold).toBe(0.1);
      expect(tddService.comparisons).toEqual([]);
    });

    it('sets up directory paths correctly', () => {
      expect(tddService.baselinePath).toBe(
        join(testDir, '.vizzly', 'baselines')
      );
      expect(tddService.currentPath).toBe(join(testDir, '.vizzly', 'current'));
      expect(tddService.diffPath).toBe(join(testDir, '.vizzly', 'diffs'));
    });

    it('uses default threshold if not provided', () => {
      const configWithoutThreshold = { ...mockConfig };
      delete configWithoutThreshold.comparison;

      const service = new TddService(configWithoutThreshold, testDir);
      expect(service.threshold).toBe(2.0); // CIEDE2000 default
    });
  });

  describe('getResults', () => {
    beforeEach(() => {
      tddService.comparisons = [
        { name: 'test1', status: 'passed' },
        { name: 'test2', status: 'failed' },
        { name: 'test3', status: 'new' },
        { name: 'test4', status: 'error' },
        { name: 'test5', status: 'passed' },
      ];
    });

    it('returns correct summary statistics', () => {
      const results = tddService.getResults();

      expect(results).toEqual({
        total: 5,
        passed: 2,
        failed: 1,
        new: 1,
        errors: 1,
        comparisons: tddService.comparisons,
        baseline: null,
      });
    });

    it('includes baseline data when available', () => {
      const mockBaseline = { buildId: 'build123', buildName: 'Test Build' };
      tddService.baselineData = mockBaseline;

      const results = tddService.getResults();
      expect(results.baseline).toEqual(mockBaseline);
    });
  });

  describe('compareScreenshot', () => {
    let mockImageBuffer;

    beforeEach(() => {
      mockImageBuffer = Buffer.from('test-image-data');
    });

    it('handles missing baseline as new screenshot', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(false);

      const result = await tddService.compareScreenshot(
        'new-screenshot',
        mockImageBuffer
      );

      expect(result).toMatchObject({
        name: 'new-screenshot',
        status: 'new',
        baseline: join(testDir, '.vizzly', 'baselines', 'new-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'new-screenshot.png'),
        diff: null,
        properties: {},
      });
      expect(result.id).toBeDefined();
      expect(result.signature).toBe('new-screenshot');

      expect(tddService.comparisons).toHaveLength(1);
      expect(tddService.comparisons[0]).toEqual(result);
    });

    it('compares screenshots successfully when they match', async () => {
      const { existsSync } = await import('node:fs');

      existsSync.mockReturnValue(true);
      compare.mockResolvedValue({
        isDifferent: false,
        diffPercentage: 0,
        totalPixels: 1000000,
        diffPixels: 0,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: null,
        heightDiff: null,
        diffPixelsList: null,
        diffClusters: null,
        intensityStats: null,
        perceptualScore: null,
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result).toMatchObject({
        name: 'test-screenshot',
        status: 'passed',
        baseline: join(testDir, '.vizzly', 'baselines', 'test-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'test-screenshot.png'),
        diff: null,
        properties: {},
        threshold: 0.1,
        totalPixels: 1000000,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
      });
      expect(result.id).toBeDefined();
      expect(result.signature).toBe('test-screenshot');

      expect(tddService.comparisons).toHaveLength(1);
    });

    it('detects differences when screenshots do not match', async () => {
      const { existsSync } = await import('node:fs');

      existsSync.mockReturnValue(true);
      compare.mockResolvedValue({
        isDifferent: true,
        diffPercentage: 5.2,
        totalPixels: 1000000,
        diffPixels: 52000,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        heightDiff: null,
        diffPixelsList: null,
        diffClusters: null,
        intensityStats: null,
        perceptualScore: null,
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result).toMatchObject({
        name: 'test-screenshot',
        status: 'failed',
        baseline: join(testDir, '.vizzly', 'baselines', 'test-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'test-screenshot.png'),
        diff: join(testDir, '.vizzly', 'diffs', 'test-screenshot.png'),
        properties: {},
        threshold: 0.1,
        diffCount: 52000,
        diffPercentage: 5.2,
        reason: 'pixel-diff',
        totalPixels: 1000000,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        heightDiff: null,
        intensityStats: null,
        diffClusters: null,
      });
      expect(result.id).toBeDefined();
      expect(result.signature).toBe('test-screenshot');
    });

    it('handles honeydiff execution errors', async () => {
      const { existsSync } = await import('node:fs');

      existsSync.mockReturnValue(true);
      compare.mockRejectedValue(new Error('honeydiff not found'));

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result).toMatchObject({
        name: 'test-screenshot',
        status: 'error',
        baseline: join(testDir, '.vizzly', 'baselines', 'test-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'test-screenshot.png'),
        diff: null,
        properties: {},
        error: 'honeydiff not found',
      });
      expect(result.id).toBeDefined();
      expect(result.signature).toBe('test-screenshot');
    });

    it('includes custom properties in comparison result', async () => {
      const { existsSync } = await import('node:fs');
      const { execSync } = await import('node:child_process');

      existsSync.mockReturnValue(true);
      execSync.mockReturnValue('');

      const properties = {
        viewport: { width: 1920, height: 1080 },
        device: 'desktop',
      };
      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer,
        properties
      );

      // Properties now get normalized with viewport_width at top level
      expect(result.properties).toMatchObject({
        viewport: { width: 1920, height: 1080 },
        device: 'desktop',
      });
    });

    it('uses different baselines for same name with different viewport widths', async () => {
      const { existsSync } = await import('node:fs');

      existsSync.mockReturnValue(false);
      compare.mockResolvedValue({
        isDifferent: false,
        diffPercentage: 0,
        totalPixels: 1000000,
        diffPixels: 0,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: null,
        heightDiff: null,
        diffPixelsList: null,
        diffClusters: null,
        intensityStats: null,
        perceptualScore: null,
      });

      // First screenshot at 1920px width
      const result1 = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        { viewport: { width: 1920, height: 1080 } }
      );

      // Second screenshot at 768px width (same name, different viewport)
      const result2 = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        { viewport: { width: 768, height: 1024 } }
      );

      // Should have different file paths (different baselines)
      expect(result1.baseline).not.toBe(result2.baseline);
      expect(result1.baseline).toContain('homepage_1920');
      expect(result2.baseline).toContain('homepage_768');

      // Should have two separate comparisons
      expect(tddService.comparisons).toHaveLength(2);
    });

    it('uses different baselines for same name with different browsers', async () => {
      const { existsSync } = await import('node:fs');

      existsSync.mockReturnValue(false);
      compare.mockResolvedValue({
        isDifferent: false,
        diffPercentage: 0,
        totalPixels: 1000000,
        diffPixels: 0,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: null,
        heightDiff: null,
        diffPixelsList: null,
        diffClusters: null,
        intensityStats: null,
        perceptualScore: null,
      });

      // First screenshot in Chrome
      const result1 = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        { browser: 'Chrome', viewport: { width: 1920, height: 1080 } }
      );

      // Second screenshot in Firefox (same name and viewport, different browser)
      const result2 = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        { browser: 'Firefox', viewport: { width: 1920, height: 1080 } }
      );

      // Should have different file paths (different baselines)
      expect(result1.baseline).not.toBe(result2.baseline);
      expect(result1.baseline).toContain('Chrome');
      expect(result2.baseline).toContain('Firefox');

      // Should have two separate comparisons
      expect(tddService.comparisons).toHaveLength(2);
    });

    it('uses same baseline for identical name, viewport, and browser', async () => {
      const { existsSync } = await import('node:fs');

      let callCount = 0;
      existsSync.mockImplementation(() => {
        callCount++;
        // First call: baseline doesn't exist, second call: baseline exists
        return callCount > 1;
      });
      compare.mockResolvedValue({
        isDifferent: false,
        diffPercentage: 0,
        totalPixels: 1000000,
        diffPixels: 0,
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: null,
        heightDiff: null,
        diffPixelsList: null,
        diffClusters: null,
        intensityStats: null,
        perceptualScore: null,
      });

      const properties = {
        browser: 'Chrome',
        viewport: { width: 1920, height: 1080 },
      };

      // First screenshot creates baseline
      const result1 = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        properties
      );

      // Second screenshot with same properties should use same baseline
      const result2 = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        properties
      );

      // Should have same baseline path
      expect(result1.baseline).toBe(result2.baseline);
    });

    it('strips browser version from signature', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(false);

      const result = await tddService.compareScreenshot(
        'homepage',
        mockImageBuffer,
        {
          browser: 'Chrome/139.0.7258.138',
          viewport: { width: 1920, height: 1080 },
        }
      );

      // Should strip version, keeping only "Chrome"
      expect(result.baseline).toContain('Chrome');
      expect(result.baseline).not.toContain('139.0.7258.138');

      // Get just the filename from the path
      const filename = result.baseline.split('/').pop();
      expect(filename).toBe('homepage_1920_Chrome.png');
    });
  });

  describe('loadBaseline', () => {
    it('loads existing baseline metadata', async () => {
      const mockMetadata = {
        buildId: 'build123',
        buildName: 'Test Build',
        threshold: 0.02,
        screenshots: [],
      };

      const { readFileSync, existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockMetadata));

      const result = await tddService.loadBaseline();

      expect(result).toEqual(mockMetadata);
      expect(tddService.baselineData).toEqual(mockMetadata);
      expect(tddService.threshold).toBe(0.02);
    });

    it('returns null when metadata file does not exist', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(false);

      const result = await tddService.loadBaseline();
      expect(result).toBeNull();
    });

    it('handles JSON parse errors gracefully', async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('invalid-json');

      const result = await tddService.loadBaseline();
      expect(result).toBeNull();
    });
  });

  describe('acceptBaseline', () => {
    beforeEach(() => {
      // Add some mock comparisons to the service
      tddService.comparisons = [
        {
          id: 'comp-123',
          name: 'screenshot1',
          signature: 'screenshot1',
          status: 'failed',
          current: join(testDir, '.vizzly', 'current', 'screenshot1.png'),
          baseline: join(testDir, '.vizzly', 'baselines', 'screenshot1.png'),
          diff: join(testDir, '.vizzly', 'diffs', 'screenshot1.png'),
          diffPercentage: 5.2,
        },
        {
          id: 'comp-456',
          name: 'screenshot2',
          signature: 'screenshot2',
          status: 'new',
          current: join(testDir, '.vizzly', 'current', 'screenshot2.png'),
          baseline: join(testDir, '.vizzly', 'baselines', 'screenshot2.png'),
          diff: null,
        },
      ];
    });

    it('accepts baseline by ID (string)', async () => {
      const result = await tddService.acceptBaseline('comp-123');

      expect(result).toMatchObject({
        name: 'screenshot1',
        status: 'accepted',
      });
    });

    it('accepts baseline by comparison object', async () => {
      // This simulates passing a comparison from report-data.json
      const comparisonObject = {
        id: 'comp-from-report',
        name: 'screenshot3',
        signature: 'screenshot3',
        status: 'failed',
        current: join(testDir, '.vizzly', 'current', 'screenshot3.png'),
        baseline: join(testDir, '.vizzly', 'baselines', 'screenshot3.png'),
        diff: join(testDir, '.vizzly', 'diffs', 'screenshot3.png'),
        diffPercentage: 2.1,
      };

      const result = await tddService.acceptBaseline(comparisonObject);

      expect(result).toMatchObject({
        name: 'screenshot3',
        status: 'accepted',
      });
    });

    it('throws error when comparison ID not found', async () => {
      await expect(
        tddService.acceptBaseline('non-existent-id')
      ).rejects.toThrow('No comparison found with ID: non-existent-id');
    });

    it('works with comparison object that is not in memory', async () => {
      // This simulates the TDD handler passing a comparison from report-data.json
      // that may not be in the service's in-memory comparisons array
      const reportComparison = {
        id: 'external-comp',
        name: 'external-screenshot',
        current: join(testDir, '.vizzly', 'current', 'external-screenshot.png'),
        baseline: join(
          testDir,
          '.vizzly',
          'baselines',
          'external-screenshot.png'
        ),
      };

      const result = await tddService.acceptBaseline(reportComparison);

      expect(result).toMatchObject({
        name: 'external-screenshot',
        status: 'accepted',
      });
    });
  });

  describe('basic integration', () => {
    it('can perform complete workflow', async () => {
      // Test that we can create service, add comparisons, and get results
      const mockBuffer = Buffer.from('test-data');

      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(false); // No baseline exists

      // Add a comparison
      await tddService.compareScreenshot('test1', mockBuffer);

      // Check results
      const results = tddService.getResults();
      expect(results.total).toBe(1);
      expect(results.new).toBe(1);
      expect(results.comparisons[0].name).toBe('test1');
      expect(results.comparisons[0].status).toBe('new');
    });
  });

  describe('loadHotspots', () => {
    it('loads hotspots from disk when file exists', async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      const mockHotspots = {
        homepage: {
          regions: [{ y1: 100, y2: 200 }],
          confidence: 'high',
        },
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(
        JSON.stringify({
          downloadedAt: '2024-01-01T00:00:00Z',
          hotspots: mockHotspots,
        })
      );

      const result = tddService.loadHotspots();

      expect(result).toEqual(mockHotspots);
    });

    it('returns null when hotspots file does not exist', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(false);

      const result = tddService.loadHotspots();

      expect(result).toBeNull();
    });

    it('returns null when JSON is invalid', async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('invalid json');

      const result = tddService.loadHotspots();

      expect(result).toBeNull();
    });

    it('returns null when hotspots key is missing', async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(
        JSON.stringify({ downloadedAt: '2024-01-01' })
      );

      const result = tddService.loadHotspots();

      expect(result).toBeNull();
    });
  });

  describe('getHotspotForScreenshot', () => {
    it('returns hotspot from memory cache when available', () => {
      tddService.hotspotData = {
        homepage: {
          regions: [{ y1: 100, y2: 200 }],
          confidence: 'high',
        },
      };

      const result = tddService.getHotspotForScreenshot('homepage');

      expect(result).toEqual({
        regions: [{ y1: 100, y2: 200 }],
        confidence: 'high',
      });
    });

    it('loads from disk when not in memory', async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      const mockHotspots = {
        dashboard: {
          regions: [{ y1: 50, y2: 150 }],
          confidence: 'medium',
        },
      };

      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify({ hotspots: mockHotspots }));

      tddService.hotspotData = null;

      const result = tddService.getHotspotForScreenshot('dashboard');

      expect(result).toEqual(mockHotspots.dashboard);
    });

    it('returns null when screenshot not found in hotspots', () => {
      tddService.hotspotData = {
        homepage: { regions: [] },
      };

      const result = tddService.getHotspotForScreenshot('nonexistent');

      expect(result).toBeNull();
    });

    it('returns null when no hotspot data available', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(false);

      tddService.hotspotData = null;

      const result = tddService.getHotspotForScreenshot('homepage');

      expect(result).toBeNull();
    });
  });

  describe('calculateHotspotCoverage', () => {
    it('returns zero coverage when no diff clusters', () => {
      const result = tddService.calculateHotspotCoverage([], {
        regions: [{ y1: 100, y2: 200 }],
      });

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when null diff clusters', () => {
      const result = tddService.calculateHotspotCoverage(null, {
        regions: [{ y1: 100, y2: 200 }],
      });

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when no hotspot regions', () => {
      const diffClusters = [{ boundingBox: { y: 100, height: 50 } }];

      const result = tddService.calculateHotspotCoverage(diffClusters, {
        regions: [],
      });

      // Early return when no hotspot regions - doesn't calculate diff lines
      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when hotspotAnalysis is null', () => {
      const diffClusters = [{ boundingBox: { y: 100, height: 50 } }];

      const result = tddService.calculateHotspotCoverage(diffClusters, null);

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('calculates 100% coverage when diff is entirely within hotspot', () => {
      const diffClusters = [{ boundingBox: { y: 150, height: 30 } }];
      const hotspotAnalysis = {
        regions: [{ y1: 100, y2: 200 }],
      };

      const result = tddService.calculateHotspotCoverage(
        diffClusters,
        hotspotAnalysis
      );

      expect(result.coverage).toBe(1);
      expect(result.linesInHotspots).toBe(30);
      expect(result.totalLines).toBe(30);
    });

    it('calculates partial coverage when diff spans hotspot boundary', () => {
      // Diff from y=90 to y=109 (20 lines: 90-109)
      // Hotspot from y1=100 to y2=200
      // Lines 100-109 are in hotspot (10 lines)
      const diffClusters = [{ boundingBox: { y: 90, height: 20 } }];
      const hotspotAnalysis = {
        regions: [{ y1: 100, y2: 200 }],
      };

      const result = tddService.calculateHotspotCoverage(
        diffClusters,
        hotspotAnalysis
      );

      expect(result.coverage).toBe(0.5); // 10/20 lines
      expect(result.linesInHotspots).toBe(10);
      expect(result.totalLines).toBe(20);
    });

    it('handles multiple diff clusters', () => {
      // Cluster 1: y=100-109 (10 lines, all in hotspot)
      // Cluster 2: y=300-309 (10 lines, none in hotspot)
      const diffClusters = [
        { boundingBox: { y: 100, height: 10 } },
        { boundingBox: { y: 300, height: 10 } },
      ];
      const hotspotAnalysis = {
        regions: [{ y1: 50, y2: 150 }],
      };

      const result = tddService.calculateHotspotCoverage(
        diffClusters,
        hotspotAnalysis
      );

      expect(result.coverage).toBe(0.5); // 10/20 lines
      expect(result.linesInHotspots).toBe(10);
      expect(result.totalLines).toBe(20);
    });

    it('handles multiple hotspot regions', () => {
      // Diff from y=100-119 (20 lines)
      // Hotspot 1: y1=100, y2=104 (5 lines covered)
      // Hotspot 2: y1=115, y2=119 (5 lines covered)
      // Total: 10/20 = 50%
      const diffClusters = [{ boundingBox: { y: 100, height: 20 } }];
      const hotspotAnalysis = {
        regions: [
          { y1: 100, y2: 104 },
          { y1: 115, y2: 119 },
        ],
      };

      const result = tddService.calculateHotspotCoverage(
        diffClusters,
        hotspotAnalysis
      );

      expect(result.coverage).toBe(0.5);
      expect(result.linesInHotspots).toBe(10);
      expect(result.totalLines).toBe(20);
    });

    it('deduplicates overlapping diff lines', () => {
      // Two clusters that overlap at y=100-109
      const diffClusters = [
        { boundingBox: { y: 100, height: 10 } }, // y=100-109
        { boundingBox: { y: 105, height: 10 } }, // y=105-114
      ];
      const hotspotAnalysis = {
        regions: [{ y1: 0, y2: 200 }], // All in hotspot
      };

      const result = tddService.calculateHotspotCoverage(
        diffClusters,
        hotspotAnalysis
      );

      // Should be 15 unique lines (100-114), not 20
      expect(result.totalLines).toBe(15);
      expect(result.linesInHotspots).toBe(15);
      expect(result.coverage).toBe(1);
    });
  });

  describe('hotspot filtering in compareScreenshot', () => {
    let mockImageBuffer;

    beforeEach(() => {
      mockImageBuffer = Buffer.from('test-image-data');
    });

    it('marks comparison as passed when diff is 80%+ in high-confidence hotspots', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);

      // Set up hotspot data with high confidence
      tddService.hotspotData = {
        'test-screenshot': {
          regions: [{ y1: 0, y2: 100 }],
          confidence: 'high',
          confidence_score: 85,
        },
      };

      // Mock honeydiff to return a diff entirely within hotspot region
      compare.mockResolvedValue({
        isDifferent: true,
        diffPercentage: 0.15,
        totalPixels: 1000000,
        diffPixels: 1500,
        diffClusters: [{ boundingBox: { y: 10, height: 20 } }], // All within hotspot
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 10, width: 100, height: 20 },
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result.status).toBe('passed');
      expect(result.reason).toBe('hotspot-filtered');
    });

    it('marks comparison as failed when diff is below 80% in hotspots', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);

      tddService.hotspotData = {
        'test-screenshot': {
          regions: [{ y1: 0, y2: 10 }], // Small hotspot
          confidence: 'high',
          confidence_score: 90,
        },
      };

      // Diff spans outside the small hotspot
      compare.mockResolvedValue({
        isDifferent: true,
        diffPercentage: 5.0,
        totalPixels: 1000000,
        diffPixels: 50000,
        diffClusters: [{ boundingBox: { y: 0, height: 100 } }], // Only 10% in hotspot
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('pixel-diff');
    });

    it('marks comparison as failed when hotspot confidence is low', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);

      tddService.hotspotData = {
        'test-screenshot': {
          regions: [{ y1: 0, y2: 100 }],
          confidence: 'low',
          confidence_score: 40, // Below 70 threshold
        },
      };

      compare.mockResolvedValue({
        isDifferent: true,
        diffPercentage: 0.15,
        totalPixels: 1000000,
        diffPixels: 1500,
        diffClusters: [{ boundingBox: { y: 10, height: 20 } }],
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 10, width: 100, height: 20 },
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('pixel-diff');
    });

    it('does not filter when no hotspot data available', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);

      tddService.hotspotData = {}; // No hotspot for this screenshot

      compare.mockResolvedValue({
        isDifferent: true,
        diffPercentage: 0.15,
        totalPixels: 1000000,
        diffPixels: 1500,
        diffClusters: [{ boundingBox: { y: 10, height: 20 } }],
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 10, width: 100, height: 20 },
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('pixel-diff');
    });

    it('uses string confidence "high" when numeric score not available', async () => {
      const { existsSync } = await import('node:fs');
      existsSync.mockReturnValue(true);

      tddService.hotspotData = {
        'test-screenshot': {
          regions: [{ y1: 0, y2: 100 }],
          confidence: 'high', // String only, no numeric score
        },
      };

      compare.mockResolvedValue({
        isDifferent: true,
        diffPercentage: 0.15,
        totalPixels: 1000000,
        diffPixels: 1500,
        diffClusters: [{ boundingBox: { y: 10, height: 20 } }],
        aaPixelsIgnored: 0,
        aaPercentage: 0,
        boundingBox: { x: 0, y: 10, width: 100, height: 20 },
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result.status).toBe('passed');
      expect(result.reason).toBe('hotspot-filtered');
    });
  });
});
