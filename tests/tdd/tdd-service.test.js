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
    blank: () => calls.push({ method: 'blank', args: [] }),
    print: (...args) => calls.push({ method: 'print', args }),
    isVerbose: () => false,
    diffBar: () => '░░░░░░░░░░', // Mock diffBar for visual output
  };
}

/**
 * Create base mock dependencies for TddService tests
 * Uses grouped dependency structure for cleaner organization
 */
function createMockDeps(overrides = {}) {
  let mockOutput = createMockOutput();

  // Default values for each group
  let defaultFs = {
    existsSync: () => false,
    mkdirSync: () => {},
    readFileSync: () => Buffer.from('test'),
    writeFileSync: () => {},
  };

  let defaultApi = {
    createApiClient: () => ({ baseUrl: 'https://api.test' }),
    getTddBaselines: async () => null,
    getBuilds: async () => ({ data: [] }),
    getComparison: async () => null,
    getBatchHotspots: async () => ({ hotspots: {} }),
    fetchWithTimeout: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    getDefaultBranch: async () => 'main',
  };

  let defaultMetadata = {
    loadBaselineMetadata: () => null,
    saveBaselineMetadata: () => {},
    createEmptyBaselineMetadata: opts => ({
      buildId: 'local',
      buildName: 'Local TDD',
      screenshots: [],
      ...opts,
    }),
    upsertScreenshotInMetadata: () => {},
    loadHotspotMetadata: () => null,
    saveHotspotMetadata: () => {},
  };

  let defaultBaseline = {
    baselineExists: () => false,
    clearBaselineData: () => {},
    getBaselinePath: (base, filename) => `${base}/${filename}.png`,
    getCurrentPath: (base, filename) => `${base}/${filename}.png`,
    getDiffPath: (base, filename) => `${base}/${filename}.png`,
    saveBaseline: () => {},
    saveCurrent: () => {},
  };

  let defaultComparison = {
    compareImages: async () => ({ isDifferent: false }),
    buildPassedComparison: params => ({
      id: 'test-id',
      status: 'passed',
      ...params,
    }),
    buildNewComparison: params => ({
      id: 'test-id',
      status: 'new',
      ...params,
    }),
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
  };

  let defaultSignature = {
    generateScreenshotSignature: (name, _props) => `${name}|1920|chrome`,
    generateBaselineFilename: (name, sig) => `${name}_${sig}`,
    generateComparisonId: sig => `comp-${sig}`,
    sanitizeScreenshotName: name => name,
    validateScreenshotProperties: props => props,
    safePath: (...parts) => parts.join('/'),
  };

  let defaultResults = {
    buildResults: (comparisons, _baseline) => ({
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
  };

  return {
    // Core utilities
    output: overrides.output ?? mockOutput,
    colors: overrides.colors ?? {
      cyan: s => s,
      green: s => s,
      red: s => s,
      yellow: s => s,
      dim: s => s,
      bold: s => s,
      underline: s => s,
    },
    validatePathSecurity: overrides.validatePathSecurity ?? (path => path),
    initializeDirectories:
      overrides.initializeDirectories ??
      (() => ({
        baselinePath: '/test/.vizzly/baselines',
        currentPath: '/test/.vizzly/current',
        diffPath: '/test/.vizzly/diffs',
      })),
    calculateHotspotCoverage:
      overrides.calculateHotspotCoverage ??
      (() => ({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      })),

    // Grouped dependencies - merge defaults with overrides
    fs: { ...defaultFs, ...overrides.fs },
    api: { ...defaultApi, ...overrides.api },
    metadata: { ...defaultMetadata, ...overrides.metadata },
    baseline: { ...defaultBaseline, ...overrides.baseline },
    comparison: { ...defaultComparison, ...overrides.comparison },
    signature: { ...defaultSignature, ...overrides.signature },
    results: { ...defaultResults, ...overrides.results },
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
        metadata: { loadBaselineMetadata: () => null },
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
        metadata: { loadBaselineMetadata: () => metadata },
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
        metadata: { loadBaselineMetadata: () => null },
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
        metadata: { loadBaselineMetadata: () => null },
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
        metadata: { loadBaselineMetadata: () => metadata },
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
        baseline: {
          baselineExists: () => false,
          saveBaseline: (path, filename, buffer) => {
            savedBaseline = { path, filename, buffer };
          },
          saveCurrent: (path, filename, buffer) => {
            savedCurrent = { path, filename, buffer };
          },
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
        baseline: { baselineExists: () => true },
        comparison: {
          compareImages: async () => ({
            isDifferent: false,
            totalPixels: 1000,
          }),
        },
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
        baseline: { baselineExists: () => true },
        comparison: {
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
        },
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
        baseline: { baselineExists: () => true },
        comparison: {
          compareImages: async () => {
            throw new Error("Image dimensions don't match");
          },
          isDimensionMismatchError: error =>
            error.message.includes("dimensions don't match"),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        {}
      );

      assert.strictEqual(result.status, 'new');
      // Dimension mismatch now logs at debug level (shown with --verbose)
      let debugCall = mockDeps.output.calls.find(
        c => c.method === 'debug' && c.args[1]?.includes('dimension mismatch')
      );
      assert.ok(debugCall);
    });

    it('returns error comparison on unexpected error', async () => {
      let mockDeps = createMockDeps({
        baseline: { baselineExists: () => true },
        comparison: {
          compareImages: async () => {
            throw new Error('Unexpected error');
          },
          isDimensionMismatchError: () => false,
        },
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
        signature: {
          sanitizeScreenshotName: () => {
            throw new Error('Invalid name');
          },
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
        baseline: { baselineExists: () => false },
        signature: {
          validateScreenshotProperties: () => {
            throw new Error('Invalid properties');
          },
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
        baseline: { baselineExists: () => true },
        signature: { validateScreenshotProperties: props => props },
        comparison: {
          compareImages: async (_base, _current, _diff, options) => {
            capturedThreshold = options.threshold;
            return { isDifferent: false };
          },
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
        baseline: { baselineExists: () => false },
        signature: { validateScreenshotProperties: props => props },
        comparison: {
          buildNewComparison: params => {
            capturedProperties = params.properties;
            return { id: 'test-id', status: 'new', ...params };
          },
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

  describe('printResults', () => {
    it('prints summary header with screenshot count', async () => {
      let mockOutput = createMockOutput();
      let mockDeps = createMockDeps({ output: mockOutput });
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.comparisons = [
        { id: '1', status: 'passed', name: 'test1' },
        { id: '2', status: 'passed', name: 'test2' },
      ];

      await service.printResults();

      // Should have printed the header
      let printCalls = mockOutput.calls.filter(c => c.method === 'print');
      let headerCall = printCalls.find(c =>
        c.args[0]?.includes('2 screenshots compared')
      );
      assert.ok(headerCall, 'Should print header with screenshot count');
    });

    it('prints passed count in default mode', async () => {
      let mockOutput = createMockOutput();
      let mockDeps = createMockDeps({ output: mockOutput });
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.comparisons = [
        { id: '1', status: 'passed', name: 'test1' },
        { id: '2', status: 'passed', name: 'test2' },
      ];

      await service.printResults();

      let printCalls = mockOutput.calls.filter(c => c.method === 'print');
      let passedCall = printCalls.find(c => c.args[0]?.includes('2 passed'));
      assert.ok(passedCall, 'Should print passed count');
    });

    it('prints failed comparisons', async () => {
      let mockOutput = createMockOutput();
      let mockDeps = createMockDeps({ output: mockOutput });
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.comparisons = [
        { id: '1', status: 'passed', name: 'test1' },
        { id: '2', status: 'failed', name: 'failed-test', diffPercentage: 1.5 },
      ];

      await service.printResults();

      let printCalls = mockOutput.calls.filter(c => c.method === 'print');
      let failedHeaderCall = printCalls.find(c =>
        c.args[0]?.includes('1 visual change')
      );
      let failedNameCall = printCalls.find(c =>
        c.args[0]?.includes('failed-test')
      );
      assert.ok(failedHeaderCall, 'Should print visual changes header');
      assert.ok(failedNameCall, 'Should print failed comparison name');
    });

    it('prints start command hint when there are changes', async () => {
      let mockOutput = createMockOutput();
      let mockDeps = createMockDeps({ output: mockOutput });
      let service = new TddService(
        { server: { port: 47392 } },
        '/test',
        false,
        null,
        mockDeps
      );

      service.comparisons = [
        { id: '1', status: 'failed', name: 'failed-test' },
      ];

      await service.printResults();

      let printCalls = mockOutput.calls.filter(c => c.method === 'print');
      let hintCall = printCalls.find(c =>
        c.args[0]?.includes('vizzly tdd start --open')
      );
      assert.ok(hintCall, 'Should print tdd start command hint');
    });

    it('does not print start command hint when all passed', async () => {
      let mockOutput = createMockOutput();
      let mockDeps = createMockDeps({ output: mockOutput });
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.comparisons = [{ id: '1', status: 'passed', name: 'test1' }];

      await service.printResults();

      let printCalls = mockOutput.calls.filter(c => c.method === 'print');
      let hintCall = printCalls.find(c =>
        c.args[0]?.includes('vizzly tdd start --open')
      );
      assert.ok(
        !hintCall,
        'Should NOT print start command hint when all passed'
      );
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
        metadata: {
          loadHotspotMetadata: () => ({
            homepage: { regions: [], confidence: 'low' },
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.getHotspotForScreenshot('homepage');

      assert.ok(result);
      assert.strictEqual(result.confidence, 'low');
    });

    it('returns null when no hotspot data exists', () => {
      let mockDeps = createMockDeps({
        metadata: { loadHotspotMetadata: () => null },
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
        metadata: { loadHotspotMetadata: () => hotspotData },
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

  describe('acceptBaseline', () => {
    it('accepts a comparison by ID and creates baseline', async () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: path => path.includes('current'),
          mkdirSync: () => {},
          readFileSync: () => Buffer.from('image-data'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      service.comparisons = [
        {
          id: 'comp-1',
          name: 'homepage',
          status: 'failed',
          properties: { browser: 'chrome', viewport_width: 1920 },
        },
      ];

      let result = await service.acceptBaseline('comp-1');

      assert.strictEqual(result.status, 'accepted');
      assert.strictEqual(result.name, 'homepage');
      assert.ok(result.message.includes('Screenshot accepted'));
    });

    it('accepts a comparison by object', async () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: path => path.includes('current'),
          mkdirSync: () => {},
          readFileSync: () => Buffer.from('image-data'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      let comparison = {
        id: 'comp-1',
        name: 'button',
        status: 'failed',
        properties: { browser: 'firefox' },
      };

      let result = await service.acceptBaseline(comparison);

      assert.strictEqual(result.status, 'accepted');
      assert.strictEqual(result.name, 'button');
    });

    it('throws error when current screenshot not found', async () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: () => false,
          mkdirSync: () => {},
          readFileSync: () => Buffer.from('image-data'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      let comparison = {
        id: 'comp-1',
        name: 'homepage',
        status: 'failed',
        properties: {},
      };

      await assert.rejects(
        () => service.acceptBaseline(comparison),
        /Current screenshot not found/
      );
    });

    it('throws error when comparison not found by ID', async () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', false, null, mockDeps);

      await assert.rejects(
        () => service.acceptBaseline('nonexistent-id'),
        /No comparison found with ID/
      );
    });

    it('creates baseline metadata if it does not exist', async () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: path => path.includes('current'),
          mkdirSync: () => {},
          readFileSync: () => Buffer.from('image-data'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      assert.strictEqual(service.baselineData, null);

      let comparison = {
        id: 'comp-1',
        name: 'homepage',
        properties: {},
      };

      await service.acceptBaseline(comparison);

      assert.ok(service.baselineData);
      assert.strictEqual(service.baselineData.buildId, 'local');
    });

    it('saves baseline to correct path without double .png extension', async () => {
      // This test ensures that acceptBaseline saves to the same path
      // that compareScreenshot will look for on subsequent runs.
      // The bug was: generateBaselineFilename returns "name_hash.png"
      // but acceptBaseline was appending ".png" again, saving to "name_hash.png.png"
      let writtenPaths = [];
      let mockDeps = createMockDeps({
        fs: {
          existsSync: path => path.includes('current'),
          mkdirSync: () => {},
          readFileSync: () => Buffer.from('image-data'),
          writeFileSync: (path, _data) => writtenPaths.push(path),
        },
        signature: {
          // Use realistic filename generation that includes .png
          generateScreenshotSignature: (name, _props) => `${name}|1920|chrome`,
          generateBaselineFilename: (name, _sig) => `${name}_abc123.png`,
          generateComparisonId: sig => `comp-${sig}`,
          sanitizeScreenshotName: name => name,
          validateScreenshotProperties: props => props,
          safePath: (...parts) => parts.join('/'),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let comparison = {
        id: 'comp-1',
        name: 'homepage',
        properties: { browser: 'chrome', viewport_width: 1920 },
      };

      await service.acceptBaseline(comparison);

      // Baseline should be saved to baselines/homepage_abc123.png (not .png.png)
      let baselinePath = writtenPaths.find(p => p.includes('baselines'));
      assert.ok(baselinePath, 'Should write to baselines directory');
      assert.ok(
        baselinePath.endsWith('homepage_abc123.png'),
        `Baseline path should end with .png, got: ${baselinePath}`
      );
      assert.ok(
        !baselinePath.endsWith('.png.png'),
        `Baseline path should NOT have double .png extension, got: ${baselinePath}`
      );
    });
  });

  describe('updateBaselines', () => {
    it('updates all comparisons with current screenshots', () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: () => true,
          readFileSync: () => Buffer.from('updated-image'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      service.comparisons = [
        {
          name: 'homepage',
          current: '/test/.vizzly/current/homepage.png',
          properties: { browser: 'chrome' },
        },
        {
          name: 'button',
          current: '/test/.vizzly/current/button.png',
          properties: {},
        },
      ];

      let count = service.updateBaselines();

      assert.strictEqual(count, 2);
    });

    it('returns 0 when no comparisons exist', () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', false, null, mockDeps);

      let count = service.updateBaselines();

      assert.strictEqual(count, 0);
      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('No comparisons found')
      );
      assert.ok(warnCall);
    });

    it('skips comparisons with missing current screenshot', () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: () => false,
          readFileSync: () => Buffer.from('image'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      service.comparisons = [
        {
          name: 'homepage',
          current: '/test/.vizzly/current/missing.png',
          properties: {},
        },
      ];

      let count = service.updateBaselines();

      assert.strictEqual(count, 0);
      let warnCall = mockDeps.output.calls.find(
        c =>
          c.method === 'warn' &&
          c.args[0].includes('Current screenshot not found')
      );
      assert.ok(warnCall);
    });

    it('creates baseline metadata if it does not exist', () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: () => true,
          readFileSync: () => Buffer.from('image'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      assert.strictEqual(service.baselineData, null);
      service.comparisons = [
        {
          name: 'homepage',
          current: '/test/.vizzly/current/homepage.png',
          properties: {},
        },
      ];

      service.updateBaselines();

      assert.ok(service.baselineData);
      assert.strictEqual(service.baselineData.buildId, 'local');
    });

    it('updates baseline metadata with screenshot entries', () => {
      let mockDeps = createMockDeps({
        fs: {
          existsSync: () => true,
          readFileSync: () => Buffer.from('image'),
          writeFileSync: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      service.comparisons = [
        {
          name: 'homepage',
          current: '/test/.vizzly/current/homepage.png',
          properties: { browser: 'chrome' },
        },
      ];

      service.updateBaselines();

      assert.ok(service.baselineData);
      assert.ok(service.baselineData.screenshots);
    });
  });

  describe('downloadBaselines', () => {
    it('uses injected getDefaultBranch when branch is not specified', async () => {
      let getDefaultBranchCalled = false;
      let mockDeps = createMockDeps({
        api: {
          getDefaultBranch: async () => {
            getDefaultBranchCalled = true;
            return 'main';
          },
          getBuilds: async () => ({ data: [] }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      // Should not throw "getDefaultBranch is not defined"
      await service.downloadBaselines('test', null, null, null);

      assert.ok(
        getDefaultBranchCalled,
        'Should call injected getDefaultBranch'
      );
    });

    it('uses injected dependencies when downloading by buildId', async () => {
      let apiCalls = [];
      let mockDeps = createMockDeps({
        api: {
          getDefaultBranch: async () => 'main',
          getTddBaselines: async (_client, buildId) => {
            apiCalls.push({ method: 'getTddBaselines', buildId });
            return {
              build: {
                id: buildId,
                name: 'Test Build',
                status: 'completed',
              },
              screenshots: [],
              signatureProperties: [],
            };
          },
        },
        baseline: {
          clearBaselineData: () => {},
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      await service.downloadBaselines('test', null, 'build-123', null);

      let tddCall = apiCalls.find(c => c.method === 'getTddBaselines');
      assert.ok(tddCall, 'Should call injected getTddBaselines');
      assert.strictEqual(tddCall.buildId, 'build-123');
    });
  });

  describe('createNewBaseline', () => {
    it('creates a new baseline and updates metadata', () => {
      let writeFileSync = (path, buffer) => {
        assert.ok(path.includes('baselines'));
        assert.ok(buffer instanceof Buffer);
      };

      let mockDeps = createMockDeps({
        fs: { writeFileSync },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.createNewBaseline(
        'homepage',
        Buffer.from('image-data'),
        { browser: 'chrome', viewport_width: 1920 },
        '/test/.vizzly/current/homepage.png',
        '/test/.vizzly/baselines/homepage.png'
      );

      assert.strictEqual(result.name, 'homepage');
      assert.strictEqual(result.status, 'new');
      assert.ok(result.id);
      assert.ok(result.signature);
    });

    it('initializes baseline metadata when not present', () => {
      let mockDeps = createMockDeps({
        fs: { writeFileSync: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      assert.strictEqual(service.baselineData, null);

      service.createNewBaseline(
        'button',
        Buffer.from('image-data'),
        { browser: 'firefox' },
        '/test/.vizzly/current/button.png',
        '/test/.vizzly/baselines/button.png'
      );

      assert.ok(service.baselineData);
      assert.strictEqual(service.baselineData.buildId, 'local');
      assert.strictEqual(service.baselineData.buildName, 'Local TDD');
    });

    it('adds comparison to service.comparisons array', () => {
      let mockDeps = createMockDeps({
        fs: { writeFileSync: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);
      assert.strictEqual(service.comparisons.length, 0);

      service.createNewBaseline(
        'card',
        Buffer.from('image-data'),
        { viewport_width: 768 },
        '/test/.vizzly/current/card.png',
        '/test/.vizzly/baselines/card.png'
      );

      assert.strictEqual(service.comparisons.length, 1);
      assert.strictEqual(service.comparisons[0].name, 'card');
      assert.strictEqual(service.comparisons[0].status, 'new');
    });

    it('generates correct signature and filename', () => {
      let mockDeps = createMockDeps({
        fs: { writeFileSync: () => {} },
        signature: {
          generateScreenshotSignature: (name, props) =>
            `${name}|${props.viewport_width || 'unknown'}|${props.browser || 'unknown'}`,
          generateComparisonId: sig => `comp-${sig}`,
          generateBaselineFilename: (name, sig) => `${name}_${sig}`,
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let result = service.createNewBaseline(
        'modal',
        Buffer.from('image-data'),
        { browser: 'safari', viewport_width: 1024 },
        '/test/.vizzly/current/modal.png',
        '/test/.vizzly/baselines/modal.png'
      );

      assert.ok(result.signature.includes('modal'));
      assert.ok(result.id.startsWith('comp-'));
    });

    it('preserves properties in comparison object', () => {
      let mockDeps = createMockDeps({
        fs: { writeFileSync: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let properties = {
        browser: 'chrome',
        viewport_width: 1440,
        viewport_height: 900,
        device: 'desktop',
      };

      let result = service.createNewBaseline(
        'responsive',
        Buffer.from('image-data'),
        properties,
        '/test/.vizzly/current/responsive.png',
        '/test/.vizzly/baselines/responsive.png'
      );

      assert.strictEqual(result.properties.browser, 'chrome');
      assert.strictEqual(result.properties.viewport_width, 1440);
      assert.strictEqual(result.properties.device, 'desktop');
    });

    it('outputs info message when baseline is created', () => {
      let mockDeps = createMockDeps({
        fs: { writeFileSync: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.createNewBaseline(
        'hero',
        Buffer.from('image-data'),
        {},
        '/test/.vizzly/current/hero.png',
        '/test/.vizzly/baselines/hero.png'
      );

      let infoCall = mockDeps.output.calls.find(
        c => c.method === 'info' && c.args[0].includes('Creating baseline')
      );
      assert.ok(infoCall);

      let successCall = mockDeps.output.calls.find(
        c => c.method === 'info' && c.args[0].includes('Baseline created')
      );
      assert.ok(successCall);
    });
  });
});
