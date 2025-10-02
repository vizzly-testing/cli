import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TddService } from '../../src/services/tdd-service.js';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock all external dependencies
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from('mock-image-data')),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
  exec: vi.fn((cmd, callback) => callback(null, '', '')),
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

// Mock odiff-bin dynamic import
vi.mock('odiff-bin', () => ({
  compare: vi.fn(async () => ({ match: true, reason: 'identical' })),
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
      expect(service.threshold).toBe(0.1);
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
      const { existsSync } = await import('fs');
      existsSync.mockReturnValue(false);

      const result = await tddService.compareScreenshot(
        'new-screenshot',
        mockImageBuffer
      );

      expect(result).toEqual({
        name: 'new-screenshot',
        status: 'new',
        baseline: join(testDir, '.vizzly', 'baselines', 'new-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'new-screenshot.png'),
        diff: null,
        properties: {},
      });

      expect(tddService.comparisons).toHaveLength(1);
      expect(tddService.comparisons[0]).toEqual(result);
    });

    it('compares screenshots successfully when they match', async () => {
      const { existsSync } = await import('fs');
      const { compare } = await import('odiff-bin');

      existsSync.mockReturnValue(true);
      compare.mockResolvedValue({ match: true, reason: 'identical' });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result).toEqual({
        name: 'test-screenshot',
        status: 'passed',
        baseline: join(testDir, '.vizzly', 'baselines', 'test-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'test-screenshot.png'),
        diff: null,
        properties: {},
        threshold: 0.1,
      });

      expect(tddService.comparisons).toHaveLength(1);
    });

    it('detects differences when screenshots do not match', async () => {
      const { existsSync } = await import('fs');
      const { compare } = await import('odiff-bin');

      existsSync.mockReturnValue(true);
      compare.mockResolvedValue({
        match: false,
        reason: 'pixel-diff',
        diffPercentage: 5.2,
      });

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result).toEqual({
        name: 'test-screenshot',
        status: 'failed',
        baseline: join(testDir, '.vizzly', 'baselines', 'test-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'test-screenshot.png'),
        diff: join(testDir, '.vizzly', 'diffs', 'test-screenshot.png'),
        properties: {},
        threshold: 0.1,
        diffCount: undefined,
        diffPercentage: 5.2,
        reason: 'pixel-diff',
      });
    });

    it('handles odiff execution errors', async () => {
      const { existsSync } = await import('fs');
      const { compare } = await import('odiff-bin');

      existsSync.mockReturnValue(true);
      compare.mockRejectedValue(new Error('odiff not found'));

      const result = await tddService.compareScreenshot(
        'test-screenshot',
        mockImageBuffer
      );

      expect(result).toEqual({
        name: 'test-screenshot',
        status: 'error',
        baseline: join(testDir, '.vizzly', 'baselines', 'test-screenshot.png'),
        current: join(testDir, '.vizzly', 'current', 'test-screenshot.png'),
        diff: null,
        properties: {},
        error: 'odiff not found',
      });
    });

    it('includes custom properties in comparison result', async () => {
      const { existsSync } = await import('fs');
      const { execSync } = await import('child_process');

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

      expect(result.properties).toEqual(properties);
    });

    it('uses different baselines for same name with different viewport widths', async () => {
      const { existsSync } = await import('fs');
      const { compare } = await import('odiff-bin');

      existsSync.mockReturnValue(false);
      compare.mockResolvedValue({ match: true, reason: 'identical' });

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
      const { existsSync } = await import('fs');
      const { compare } = await import('odiff-bin');

      existsSync.mockReturnValue(false);
      compare.mockResolvedValue({ match: true, reason: 'identical' });

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
      const { existsSync } = await import('fs');
      const { compare } = await import('odiff-bin');

      let callCount = 0;
      existsSync.mockImplementation(() => {
        callCount++;
        // First call: baseline doesn't exist, second call: baseline exists
        return callCount > 1;
      });
      compare.mockResolvedValue({ match: true, reason: 'identical' });

      let properties = {
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
      const { existsSync } = await import('fs');
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
      let filename = result.baseline.split('/').pop();
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

      const { readFileSync, existsSync } = await import('fs');
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(mockMetadata));

      const result = await tddService.loadBaseline();

      expect(result).toEqual(mockMetadata);
      expect(tddService.baselineData).toEqual(mockMetadata);
      expect(tddService.threshold).toBe(0.02);
    });

    it('returns null when metadata file does not exist', async () => {
      const { existsSync } = await import('fs');
      existsSync.mockReturnValue(false);

      const result = await tddService.loadBaseline();
      expect(result).toBeNull();
    });

    it('handles JSON parse errors gracefully', async () => {
      const { readFileSync, existsSync } = await import('fs');
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue('invalid-json');

      const result = await tddService.loadBaseline();
      expect(result).toBeNull();
    });
  });

  describe('basic integration', () => {
    it('can perform complete workflow', async () => {
      // Test that we can create service, add comparisons, and get results
      const mockBuffer = Buffer.from('test-data');

      const { existsSync } = await import('fs');
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
});
