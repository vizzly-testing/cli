import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTddHandler } from '../../../src/server/handlers/tdd-handler.js';

// Mock dependencies
vi.mock('../../../src/services/tdd-service.js', () => ({
  TddService: vi.fn(),
}));

vi.mock('../../../src/utils/logger-factory.js', () => ({
  createServiceLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/colors.js', () => ({
  colors: {
    cyan: vi.fn(text => text),
    green: vi.fn(text => text),
    red: vi.fn(text => text),
  },
}));

describe('createTddHandler', () => {
  let mockConfig;
  let mockTddService;
  let handler;

  beforeEach(async () => {
    mockConfig = {
      apiKey: 'test-api-key',
      comparison: { threshold: 0.01 },
    };

    mockTddService = {
      loadBaseline: vi.fn(),
      downloadBaselines: vi.fn(),
      compareScreenshot: vi.fn(),
      printResults: vi.fn(),
    };

    const { TddService } = await import('../../../src/services/tdd-service.js');
    TddService.mockImplementation(() => mockTddService);

    handler = createTddHandler(
      mockConfig,
      '/test/workingDir',
      'baseline-build-id',
      'baseline-comparison-id'
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should use existing baseline when available', async () => {
      const mockBaseline = { buildName: 'Test Baseline' };
      mockTddService.loadBaseline.mockResolvedValue(mockBaseline);

      await handler.initialize();

      expect(mockTddService.loadBaseline).toHaveBeenCalled();
      expect(mockTddService.downloadBaselines).not.toHaveBeenCalled();
    });

    it('should download baseline when none exists and API key available', async () => {
      mockTddService.loadBaseline.mockResolvedValue(null);
      mockTddService.downloadBaselines.mockResolvedValue();

      await handler.initialize();

      expect(mockTddService.loadBaseline).toHaveBeenCalled();
      expect(mockTddService.downloadBaselines).toHaveBeenCalledWith(
        'baseline-build-id',
        'baseline-comparison-id'
      );
    });

    it('should handle missing baseline without API key', async () => {
      const configWithoutApiKey = { ...mockConfig, apiKey: null };
      const handlerWithoutKey = createTddHandler(
        configWithoutApiKey,
        '/test/workingDir',
        'baseline-build-id',
        'baseline-comparison-id'
      );

      mockTddService.loadBaseline.mockResolvedValue(null);

      await handlerWithoutKey.initialize();

      expect(mockTddService.loadBaseline).toHaveBeenCalled();
      expect(mockTddService.downloadBaselines).not.toHaveBeenCalled();
    });
  });

  describe('registerBuild', () => {
    it('should register a new build', () => {
      const buildId = 'test-build-123';

      handler.registerBuild(buildId);

      expect(handler.getScreenshotCount(buildId)).toBe(0);
    });

    it('should handle multiple builds', () => {
      handler.registerBuild('build-1');
      handler.registerBuild('build-2');

      expect(handler.getScreenshotCount('build-1')).toBe(0);
      expect(handler.getScreenshotCount('build-2')).toBe(0);
    });
  });

  describe('handleScreenshot', () => {
    const buildId = 'test-build';
    const screenshotName = 'test-screenshot';
    const imageData = 'base64-image-data';
    const properties = { viewport: '1920x1080' };

    beforeEach(() => {
      handler.registerBuild(buildId);
    });

    it('should handle successful comparison', async () => {
      const mockComparison = {
        name: screenshotName,
        status: 'passed',
      };
      mockTddService.compareScreenshot.mockResolvedValue(mockComparison);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.tddMode).toBe(true);
      expect(result.body.comparison).toEqual(mockComparison);
      expect(handler.getScreenshotCount(buildId)).toBe(1);
    });

    it('should handle failed comparison', async () => {
      const mockComparison = {
        name: screenshotName,
        status: 'failed',
        baseline: '/path/to/baseline.png',
        current: '/path/to/current.png',
        diff: '/path/to/diff.png',
      };
      mockTddService.compareScreenshot.mockResolvedValue(mockComparison);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(422);
      expect(result.body.error).toBe('Visual difference detected');
      expect(result.body.tddMode).toBe(true);
      expect(result.body.comparison).toEqual(mockComparison);
    });

    it('should handle baseline update', async () => {
      const mockComparison = {
        name: screenshotName,
        status: 'baseline-updated',
        baseline: '/path/to/baseline.png',
        current: '/path/to/current.png',
      };
      mockTddService.compareScreenshot.mockResolvedValue(mockComparison);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(200);
      expect(result.body.status).toBe('success');
      expect(result.body.message).toBe(
        `Baseline updated for ${screenshotName}`
      );
      expect(result.body.tddMode).toBe(true);
    });

    it('should handle comparison error', async () => {
      const mockComparison = {
        status: 'error',
        error: 'File not found',
      };
      mockTddService.compareScreenshot.mockResolvedValue(mockComparison);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData,
        properties
      );

      expect(result.statusCode).toBe(500);
      expect(result.body.error).toBe('Comparison failed: File not found');
      expect(result.body.tddMode).toBe(true);
    });

    it('should throw error for non-existent build', async () => {
      await expect(
        handler.handleScreenshot(
          'non-existent-build',
          screenshotName,
          imageData,
          properties
        )
      ).rejects.toThrow('Build non-existent-build not found');
    });

    it('should handle screenshots without properties', async () => {
      const mockComparison = {
        name: screenshotName,
        status: 'passed',
      };
      mockTddService.compareScreenshot.mockResolvedValue(mockComparison);

      const result = await handler.handleScreenshot(
        buildId,
        screenshotName,
        imageData
      );

      expect(result.statusCode).toBe(200);
      expect(mockTddService.compareScreenshot).toHaveBeenCalledWith(
        screenshotName,
        expect.any(Buffer),
        {}
      );
    });
  });

  describe('getScreenshotCount', () => {
    it('should return 0 for non-existent build', () => {
      expect(handler.getScreenshotCount('non-existent')).toBe(0);
    });

    it('should return correct count after screenshots', async () => {
      const buildId = 'test-build';
      handler.registerBuild(buildId);

      mockTddService.compareScreenshot.mockResolvedValue({ status: 'passed' });

      await handler.handleScreenshot(buildId, 'screenshot1', 'data1');
      expect(handler.getScreenshotCount(buildId)).toBe(1);

      await handler.handleScreenshot(buildId, 'screenshot2', 'data2');
      expect(handler.getScreenshotCount(buildId)).toBe(2);
    });
  });

  describe('finishBuild', () => {
    const buildId = 'test-build';

    beforeEach(() => {
      handler.registerBuild(buildId);
    });

    it('should finish build successfully with screenshots', async () => {
      const mockResults = {
        total: 2,
        passed: 1,
        failed: 1,
        new: 0,
        errors: 0,
      };
      mockTddService.printResults.mockReturnValue(mockResults);
      mockTddService.compareScreenshot.mockResolvedValue({ status: 'passed' });

      // Add a screenshot first
      await handler.handleScreenshot(buildId, 'test', 'data');

      const result = await handler.finishBuild(buildId);

      expect(result.id).toBe(buildId);
      expect(result.tddMode).toBe(true);
      expect(result.results).toEqual(mockResults);
      expect(result.url).toBe(null);
      expect(result.passed).toBe(false); // Because 1 failed
      expect(mockTddService.printResults).toHaveBeenCalled();
    });

    it('should determine passed status correctly', async () => {
      const mockResults = {
        total: 2,
        passed: 2,
        failed: 0,
        new: 0,
        errors: 0,
      };
      mockTddService.printResults.mockReturnValue(mockResults);
      mockTddService.compareScreenshot.mockResolvedValue({ status: 'passed' });

      await handler.handleScreenshot(buildId, 'test', 'data');

      const result = await handler.finishBuild(buildId);

      expect(result.passed).toBe(true);
    });

    it('should throw error for build without screenshots', async () => {
      await expect(handler.finishBuild(buildId)).rejects.toThrow(
        'No screenshots to process. Make sure your tests are calling the Vizzly screenshot function.'
      );
    });

    it('should throw error for non-existent build', async () => {
      await expect(handler.finishBuild('non-existent')).rejects.toThrow(
        'Build non-existent not found'
      );
    });
  });

  describe('cleanup', () => {
    it('should clear all builds', () => {
      handler.registerBuild('build1');
      handler.registerBuild('build2');

      expect(handler.getScreenshotCount('build1')).toBe(0);
      expect(handler.getScreenshotCount('build2')).toBe(0);

      handler.cleanup();

      expect(handler.getScreenshotCount('build1')).toBe(0);
      expect(handler.getScreenshotCount('build2')).toBe(0);
    });
  });
});
