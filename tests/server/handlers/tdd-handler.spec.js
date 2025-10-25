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
      comparison: { threshold: 0.1 },
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
      // Create handler without baseline override flags
      const handlerWithoutOverride = createTddHandler(
        mockConfig,
        '/test/workingDir'
      );

      const mockBaseline = { buildName: 'Test Baseline' };
      mockTddService.loadBaseline.mockResolvedValue(mockBaseline);

      await handlerWithoutOverride.initialize();

      expect(mockTddService.loadBaseline).toHaveBeenCalled();
      expect(mockTddService.downloadBaselines).not.toHaveBeenCalled();
    });

    it('should NOT download baseline when none exists without baseline flags', async () => {
      // Create handler without baseline override flags
      const handlerWithoutOverride = createTddHandler(
        mockConfig,
        '/test/workingDir'
      );

      mockTddService.loadBaseline.mockResolvedValue(null);
      mockTddService.downloadBaselines.mockResolvedValue();

      await handlerWithoutOverride.initialize();

      expect(mockTddService.loadBaseline).toHaveBeenCalled();
      // Should NOT download without explicit baseline flags
      expect(mockTddService.downloadBaselines).not.toHaveBeenCalled();
    });

    it('should force download when baseline override flags provided', async () => {
      // Use the original handler that has baseline override flags
      mockTddService.downloadBaselines.mockResolvedValue();

      await handler.initialize();

      expect(mockTddService.loadBaseline).not.toHaveBeenCalled();
      expect(mockTddService.downloadBaselines).toHaveBeenCalledWith(
        'test', // environment
        null, // branch
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

  describe('handleScreenshot', () => {
    const buildId = 'test-build';
    const screenshotName = 'test-screenshot';
    // Use actual valid base64 encoded image data
    const imageData = Buffer.from('fake-png-image-data').toString('base64');
    const properties = { viewport: '1920x1080' };

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
    });

    it('should handle failed comparison', async () => {
      const mockComparison = {
        name: screenshotName,
        status: 'failed',
        baseline: '/path/to/baseline.png',
        current: '/path/to/current.png',
        diff: '/path/to/diff.png',
        diffPercentage: 2.5,
        threshold: 0.1,
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
      expect(result.body.comparison).toEqual({
        name: screenshotName,
        status: 'failed',
        baseline: '/path/to/baseline.png',
        current: '/path/to/current.png',
        diff: '/path/to/diff.png',
        diffPercentage: 2.5,
        threshold: 0.1,
      });
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

    it('should auto-register non-existent build', async () => {
      const mockComparison = {
        name: screenshotName,
        status: 'passed',
      };
      mockTddService.compareScreenshot.mockResolvedValue(mockComparison);

      const result = await handler.handleScreenshot(
        'non-existent-build',
        screenshotName,
        imageData,
        properties
      );

      // Should successfully handle the screenshot by auto-registering the build
      expect(result.statusCode).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.comparison.name).toBe(screenshotName);
      expect(result.body.comparison.status).toBe('passed');
      expect(result.body.tddMode).toBe(true);
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
        expect.objectContaining({
          viewport_width: null,
          viewport_height: null,
          browser: null,
          device: null,
          url: null,
          selector: null,
        })
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup without errors', () => {
      expect(() => handler.cleanup()).not.toThrow();
    });
  });
});
