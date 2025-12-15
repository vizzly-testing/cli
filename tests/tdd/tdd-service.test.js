import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createTDDService, TddService } from '../../src/tdd/tdd-service.js';

/**
 * Create mock output for testing
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    info: (...args) => calls.push({ method: 'info', args }),
    debug: (...args) => calls.push({ method: 'debug', args }),
    warn: (...args) => calls.push({ method: 'warn', args }),
    error: (...args) => calls.push({ method: 'error', args }),
  };
}

/**
 * Create base mock dependencies for TddService tests
 */
function createMockDeps(overrides = {}) {
  let mockOutput = createMockOutput();

  return {
    output: mockOutput,
    createApiClient: () => ({ baseUrl: 'https://api.test' }),
    validatePathSecurity: path => path,
    initializeDirectories: () => ({
      baselinePath: '/test/.vizzly/baselines',
      currentPath: '/test/.vizzly/current',
      diffPath: '/test/.vizzly/diffs',
    }),
    // File system
    existsSync: () => false,
    mkdirSync: () => {},
    readFileSync: () => Buffer.from('test'),
    writeFileSync: () => {},
    // API
    getTddBaselines: async () => null,
    getBuilds: async () => ({ data: [] }),
    getComparison: async () => null,
    getBatchHotspots: async () => ({ hotspots: {} }),
    fetchWithTimeout: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    getDefaultBranch: async () => 'main',
    // Baseline metadata
    loadBaselineMetadata: () => null,
    saveBaselineMetadata: () => {},
    createEmptyBaselineMetadata: opts => ({
      buildId: 'local',
      buildName: 'Local TDD',
      screenshots: [],
      ...opts,
    }),
    upsertScreenshotInMetadata: () => {},
    // Hotspot metadata
    loadHotspotMetadata: () => null,
    saveHotspotMetadata: () => {},
    // Baseline manager
    baselineExists: () => false,
    clearBaselineData: () => {},
    getBaselinePath: (base, filename) => `${base}/${filename}.png`,
    getCurrentPath: (base, filename) => `${base}/${filename}.png`,
    getDiffPath: (base, filename) => `${base}/${filename}.png`,
    saveBaseline: () => {},
    saveCurrent: () => {},
    // Comparison service
    compareImages: async () => ({ isDifferent: false }),
    buildPassedComparison: params => ({
      id: 'test-id',
      status: 'passed',
      ...params,
    }),
    buildNewComparison: params => ({ id: 'test-id', status: 'new', ...params }),
    buildFailedComparison: params => ({
      id: 'test-id',
      status: 'failed',
      ...params,
    }),
    buildErrorComparison: params => ({
      id: 'test-id',
      status: 'error',
      ...params,
    }),
    isDimensionMismatchError: () => false,
    // Signature/security
    generateScreenshotSignature: (name, props) => `${name}|1920|chrome`,
    generateBaselineFilename: (name, sig) => `${name}_${sig}`,
    generateComparisonId: sig => `comp-${sig}`,
    sanitizeScreenshotName: name => name,
    validateScreenshotProperties: props => props,
    safePath: (...parts) => parts.join('/'),
    // Result service
    buildResults: (comparisons, baseline) => ({
      total: comparisons.length,
      passed: comparisons.filter(c => c.status === 'passed').length,
      failed: comparisons.filter(c => c.status === 'failed').length,
      new: comparisons.filter(c => c.status === 'new').length,
      errors: comparisons.filter(c => c.status === 'error').length,
      comparisons,
    }),
    getFailedComparisons: comparisons =>
      comparisons.filter(c => c.status === 'failed'),
    getNewComparisons: comparisons =>
      comparisons.filter(c => c.status === 'new'),
    // Other
    calculateHotspotCoverage: () => ({
      coverage: 0,
      linesInHotspots: 0,
      totalLines: 0,
    }),
    colors: {
      cyan: s => s,
      green: s => s,
      red: s => s,
      yellow: s => s,
    },
    StaticReportGenerator: class {
      generateReport() {
        return '/test/.vizzly/report.html';
      }
    },
    ...overrides,
  };
}

describe('tdd/tdd-service', () => {
  describe('createTDDService', () => {
    it('creates TddService instance with default options', () => {
      let mockDeps = createMockDeps();
      let service = createTDDService({}, {}, mockDeps);

      assert.ok(service instanceof TddService);
    });

    it('passes options to TddService constructor', () => {
      let mockDeps = createMockDeps();
      let service = createTDDService(
        { comparison: { threshold: 5.0 } },
        { workingDir: '/custom', setBaseline: true },
        mockDeps
      );

      assert.strictEqual(service.setBaseline, true);
      assert.strictEqual(service.workingDir, '/custom');
      assert.strictEqual(service.threshold, 5.0);
    });
  });

  describe('TddService constructor', () => {
    it('initializes with default values', () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, process.cwd(), false, null, mockDeps);

      assert.strictEqual(service.threshold, 2.0);
      assert.strictEqual(service.minClusterSize, 2);
      assert.deepStrictEqual(service.signatureProperties, []);
      assert.strictEqual(service.comparisons.length, 0);
    });

    it('uses config values when provided', () => {
      let mockDeps = createMockDeps();
      let config = {
        comparison: { threshold: 3.5, minClusterSize: 5 },
        signatureProperties: ['browser', 'viewport'],
      };
      let service = new TddService(config, '/test', false, null, mockDeps);

      assert.strictEqual(service.threshold, 3.5);
      assert.strictEqual(service.minClusterSize, 5);
      assert.deepStrictEqual(service.signatureProperties, [
        'browser',
        'viewport',
      ]);
    });

    it('outputs baseline update mode message when setBaseline is true', () => {
      let mockDeps = createMockDeps();
      new TddService({}, '/test', true, null, mockDeps);

      let infoCall = mockDeps.output.calls.find(
        c => c.method === 'info' && c.args[0].includes('Baseline update mode')
      );
      assert.ok(infoCall);
    });

    it('throws error for invalid working directory', () => {
      let mockDeps = createMockDeps({
        validatePathSecurity: () => {
          throw new Error('Invalid path');
        },
      });

      assert.throws(
        () => new TddService({}, '/invalid', false, null, mockDeps),
        /Working directory validation failed/
      );
    });
  });

  describe('loadBaseline', () => {
    it('returns null in setBaseline mode', async () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', true, null, mockDeps);

      let result = await service.loadBaseline();

      assert.strictEqual(result, null);
      let debugCall = mockDeps.output.calls.find(
        c => c.method === 'debug' && c.args[1]?.includes('skipping loading')
      );
      assert.ok(debugCall);
    });

    it('returns null when no metadata exists', async () => {
      let mockDeps = createMockDeps({
        loadBaselineMetadata: () => null,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.loadBaseline();

      assert.strictEqual(result, null);
    });

    it('loads and returns metadata when it exists', async () => {
      let metadata = {
        buildId: 'build-123',
        buildName: 'Test Build',
        threshold: 4.0,
        signatureProperties: ['device'],
        screenshots: [],
      };
      let mockDeps = createMockDeps({
        loadBaselineMetadata: () => metadata,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.loadBaseline();

      assert.deepStrictEqual(result, metadata);
      assert.strictEqual(service.baselineData, metadata);
      assert.strictEqual(service.threshold, 4.0);
      assert.deepStrictEqual(service.signatureProperties, ['device']);
    });
  });

  describe('handleLocalBaselines', () => {
    it('returns null in setBaseline mode', async () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', true, null, mockDeps);

      let result = await service.handleLocalBaselines();

      assert.strictEqual(result, null);
      assert.strictEqual(service.baselineData, null);
    });

    it('returns null and logs message when no baseline exists (no API key)', async () => {
      let mockDeps = createMockDeps({
        loadBaselineMetadata: () => null,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.handleLocalBaselines();

      assert.strictEqual(result, null);
      let infoCall = mockDeps.output.calls.find(
        c =>
          c.method === 'info' && c.args[0].includes('No local baseline found')
      );
      assert.ok(infoCall);
    });

    it('returns null and logs different message when no baseline exists (with API key)', async () => {
      let mockDeps = createMockDeps({
        loadBaselineMetadata: () => null,
      });
      let service = new TddService(
        { apiKey: 'test-key' },
        '/test',
        false,
        null,
        mockDeps
      );

      let result = await service.handleLocalBaselines();

      assert.strictEqual(result, null);
      let infoCall = mockDeps.output.calls.find(
        c => c.method === 'info' && c.args[0].includes('API key available')
      );
      assert.ok(infoCall);
    });

    it('returns baseline when it exists', async () => {
      let metadata = {
        buildId: 'build-123',
        buildName: 'Test Build',
        screenshots: [],
      };
      let mockDeps = createMockDeps({
        loadBaselineMetadata: () => metadata,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.handleLocalBaselines();

      assert.deepStrictEqual(result, metadata);
    });
  });

  describe('compareScreenshot', () => {
    it('creates new baseline when none exists', async () => {
      let savedBaseline = null;
      let savedCurrent = null;
      let mockDeps = createMockDeps({
        baselineExists: () => false,
        saveBaseline: (path, filename, buffer) => {
          savedBaseline = { path, filename, buffer };
        },
        saveCurrent: (path, filename, buffer) => {
          savedCurrent = { path, filename, buffer };
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      let imageBuffer = Buffer.from('test-image');

      let result = await service.compareScreenshot('homepage', imageBuffer, {});

      assert.strictEqual(result.status, 'new');
      assert.strictEqual(result.name, 'homepage');
      assert.ok(savedBaseline);
      assert.ok(savedCurrent);
      assert.strictEqual(service.comparisons.length, 1);
    });

    it('returns passed comparison when images match', async () => {
      let mockDeps = createMockDeps({
        baselineExists: () => true,
        compareImages: async () => ({ isDifferent: false, totalPixels: 1000 }),
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        {}
      );

      assert.strictEqual(result.status, 'passed');
      assert.strictEqual(service.comparisons.length, 1);
    });

    it('returns failed comparison when images differ', async () => {
      let mockDeps = createMockDeps({
        baselineExists: () => true,
        compareImages: async () => ({
          isDifferent: true,
          diffPercentage: 5.5,
          diffPixels: 1000,
          diffClusters: [],
        }),
        buildFailedComparison: params => ({
          id: 'test-id',
          status: 'failed',
          ...params,
        }),
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        {}
      );

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(service.comparisons.length, 1);
    });

    it('handles dimension mismatch by creating new baseline', async () => {
      let mockDeps = createMockDeps({
        baselineExists: () => true,
        compareImages: async () => {
          throw new Error("Image dimensions don't match");
        },
        isDimensionMismatchError: error =>
          error.message.includes("dimensions don't match"),
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        {}
      );

      assert.strictEqual(result.status, 'new');
      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('Dimension mismatch')
      );
      assert.ok(warnCall);
    });

    it('returns error comparison on unexpected error', async () => {
      let mockDeps = createMockDeps({
        baselineExists: () => true,
        compareImages: async () => {
          throw new Error('Unexpected error');
        },
        isDimensionMismatchError: () => false,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        {}
      );

      assert.strictEqual(result.status, 'error');
    });

    it('throws error for invalid screenshot name', async () => {
      let mockDeps = createMockDeps({
        sanitizeScreenshotName: () => {
          throw new Error('Invalid name');
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      await assert.rejects(
        () =>
          service.compareScreenshot('invalid<>name', Buffer.from('test'), {}),
        /Screenshot name validation failed/
      );
    });

    it('handles invalid properties gracefully', async () => {
      let mockDeps = createMockDeps({
        baselineExists: () => false,
        validateScreenshotProperties: () => {
          throw new Error('Invalid properties');
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      // Should not throw, just log warning
      let result = await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        { invalid: 'prop' }
      );

      assert.strictEqual(result.status, 'new');
      let warnCall = mockDeps.output.calls.find(
        c =>
          c.method === 'warn' &&
          c.args[0].includes('Property validation failed')
      );
      assert.ok(warnCall);
    });

    it('uses per-screenshot threshold when provided', async () => {
      let capturedThreshold = null;
      let mockDeps = createMockDeps({
        baselineExists: () => true,
        validateScreenshotProperties: props => props,
        compareImages: async (base, current, diff, options) => {
          capturedThreshold = options.threshold;
          return { isDifferent: false };
        },
      });
      let service = new TddService(
        { comparison: { threshold: 2.0 } },
        '/test',
        false,
        null,
        mockDeps
      );

      await service.compareScreenshot('homepage', Buffer.from('test'), {
        threshold: 5.0,
      });

      assert.strictEqual(capturedThreshold, 5.0);
    });

    it('normalizes viewport_width from viewport.width', async () => {
      let capturedProperties = null;
      let mockDeps = createMockDeps({
        baselineExists: () => false,
        validateScreenshotProperties: props => props,
        buildNewComparison: params => {
          capturedProperties = params.properties;
          return { id: 'test-id', status: 'new', ...params };
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      await service.compareScreenshot('homepage', Buffer.from('test'), {
        viewport: { width: 1920, height: 1080 },
      });

      assert.strictEqual(capturedProperties.viewport_width, 1920);
    });
  });

  describe('getResults', () => {
    it('returns results summary from buildResults', () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', false, null, mockDeps);

      // Add some comparisons
      service.comparisons = [
        { id: '1', status: 'passed', name: 'test1' },
        { id: '2', status: 'failed', name: 'test2' },
        { id: '3', status: 'new', name: 'test3' },
      ];

      let results = service.getResults();

      assert.strictEqual(results.total, 3);
      assert.strictEqual(results.passed, 1);
      assert.strictEqual(results.failed, 1);
      assert.strictEqual(results.new, 1);
    });
  });

  describe('getHotspotForScreenshot', () => {
    it('returns hotspot from memory cache', () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.hotspotData = {
        homepage: { regions: [{ y1: 0, y2: 100 }], confidence: 'high' },
      };

      let result = service.getHotspotForScreenshot('homepage');

      assert.deepStrictEqual(result, {
        regions: [{ y1: 0, y2: 100 }],
        confidence: 'high',
      });
    });

    it('loads hotspots from disk if not in memory', () => {
      let mockDeps = createMockDeps({
        loadHotspotMetadata: () => ({
          homepage: { regions: [], confidence: 'low' },
        }),
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.getHotspotForScreenshot('homepage');

      assert.ok(result);
      assert.strictEqual(result.confidence, 'low');
    });

    it('returns null when no hotspot data exists', () => {
      let mockDeps = createMockDeps({
        loadHotspotMetadata: () => null,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.getHotspotForScreenshot('nonexistent');

      assert.strictEqual(result, null);
    });
  });

  describe('loadHotspots', () => {
    it('delegates to loadHotspotMetadata', () => {
      let hotspotData = { homepage: { regions: [] } };
      let mockDeps = createMockDeps({
        loadHotspotMetadata: () => hotspotData,
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.loadHotspots();

      assert.deepStrictEqual(result, hotspotData);
    });
  });

  describe('calculateHotspotCoverage', () => {
    it('delegates to calculateHotspotCoverage function', () => {
      let mockDeps = createMockDeps({
        calculateHotspotCoverage: () => ({
          coverage: 0.85,
          linesInHotspots: 85,
          totalLines: 100,
        }),
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.calculateHotspotCoverage([], {});

      assert.strictEqual(result.coverage, 0.85);
    });
  });
});
