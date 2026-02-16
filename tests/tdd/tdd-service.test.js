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

  describe('_upsertComparison', () => {
    it('replaces existing comparison when ID matches', () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', false, null, mockDeps);

      // Add initial comparison
      service.comparisons = [
        {
          id: 'comp-1',
          name: 'homepage',
          status: 'failed',
          diffPercentage: 5.0,
        },
        { id: 'comp-2', name: 'button', status: 'passed' },
      ];

      // Upsert with same ID but different status
      service._upsertComparison({
        id: 'comp-1',
        name: 'homepage',
        status: 'passed',
        diffPercentage: 0,
      });

      assert.strictEqual(service.comparisons.length, 2);
      assert.strictEqual(service.comparisons[0].status, 'passed');
      assert.strictEqual(service.comparisons[0].diffPercentage, 0);
    });

    it('appends new comparison when ID does not exist', () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', false, null, mockDeps);

      service.comparisons = [
        { id: 'comp-1', name: 'homepage', status: 'passed' },
      ];

      service._upsertComparison({
        id: 'comp-2',
        name: 'button',
        status: 'new',
      });

      assert.strictEqual(service.comparisons.length, 2);
      assert.strictEqual(service.comparisons[1].id, 'comp-2');
    });

    it('prevents stale results from accumulating in daemon mode', async () => {
      // This test verifies the fix for issue #158
      // In daemon mode, re-running tests should replace old results, not accumulate them
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
            id: params.signature ? `comp-${params.signature}` : 'test-id',
            status: 'failed',
            ...params,
          }),
        },
        signature: {
          generateScreenshotSignature: () => 'homepage|1920|chrome',
          generateBaselineFilename: () => 'homepage_hash.png',
          generateComparisonId: sig => `comp-${sig}`,
          sanitizeScreenshotName: name => name,
          validateScreenshotProperties: props => props,
          safePath: (...parts) => parts.join('/'),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      // First run - screenshot fails
      await service.compareScreenshot('homepage', Buffer.from('test1'), {});
      assert.strictEqual(service.comparisons.length, 1);
      assert.strictEqual(service.comparisons[0].status, 'failed');

      // Second run - same screenshot, still fails (simulating daemon mode re-run)
      // Without the fix, this would add a second comparison
      await service.compareScreenshot('homepage', Buffer.from('test2'), {});
      assert.strictEqual(
        service.comparisons.length,
        1,
        'Should still have only 1 comparison, not 2'
      );
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

    it('handles dimension mismatch as a failed comparison', async () => {
      let baselineSaved = false;
      let metadataSaved = false;
      let mockDeps = createMockDeps({
        baseline: {
          baselineExists: () => true,
          saveBaseline: () => {
            baselineSaved = true;
          },
        },
        metadata: {
          saveBaselineMetadata: () => {
            metadataSaved = true;
          },
        },
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

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.reason, 'dimension-mismatch');
      assert.strictEqual(result.error, "Image dimensions don't match");
      assert.strictEqual(baselineSaved, false);
      assert.strictEqual(metadataSaved, false);
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

  describe('processDownloadedBaselines', () => {
    it('clears local baseline data before processing', async () => {
      let clearCalled = false;
      let mockDeps = createMockDeps({
        baseline: {
          clearBaselineData: () => {
            clearCalled = true;
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [],
        signatureProperties: [],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.ok(clearCalled, 'Should clear baseline data');
    });

    it('extracts and stores signature properties from API response', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [],
        signatureProperties: ['browser', 'viewport_width'],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.deepStrictEqual(service.signatureProperties, [
        'browser',
        'viewport_width',
      ]);
    });

    it('returns null and falls back to local baselines when build status is failed', async () => {
      let handleLocalBaselinesCalled = false;
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        metadata: {
          loadBaselineMetadata: () => {
            handleLocalBaselinesCalled = true;
            return null;
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'failed' },
        screenshots: [],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      // handleLocalBaselines loads baseline metadata
      assert.ok(handleLocalBaselinesCalled);
    });

    it('warns when build status is not completed', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'pending' },
        screenshots: [],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('pending')
      );
      assert.ok(warnCall, 'Should warn about non-completed status');
    });

    it('returns null when no screenshots in build', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [],
      };

      let result = await service.processDownloadedBaselines(
        apiResponse,
        'build-1'
      );

      assert.strictEqual(result, null);
    });

    it('skips screenshots without filename', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          { name: 'test', original_url: 'http://example.com/1.png' },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('no filename')
      );
      assert.ok(warnCall, 'Should warn about missing filename');
    });

    it('skips download when SHA matches existing file', async () => {
      let fetchCalled = false;
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => true,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => ({
            screenshots: [{ filename: 'test_abc.png', sha256: 'matching-sha' }],
          }),
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => {
            fetchCalled = true;
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test_abc.png',
            sha256: 'matching-sha',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.ok(!fetchCalled, 'Should not fetch when SHA matches');
    });

    it('downloads screenshots when SHA differs', async () => {
      let fetchCalled = false;
      let writtenFiles = [];
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => true,
          writeFileSync: (path, buffer) => writtenFiles.push({ path, buffer }),
        },
        metadata: {
          loadBaselineMetadata: () => ({
            screenshots: [{ filename: 'test_abc.png', sha256: 'old-sha' }],
          }),
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => {
            fetchCalled = true;
            return {
              ok: true,
              arrayBuffer: async () => new ArrayBuffer(10),
            };
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test_abc.png',
            sha256: 'new-sha',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.ok(fetchCalled, 'Should fetch when SHA differs');
      assert.strictEqual(writtenFiles.length, 2); // screenshot + metadata
    });

    it('skips screenshots without download URL', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: { existsSync: () => false },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [{ name: 'test', filename: 'test.png' }],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('no download URL')
      );
      assert.ok(warnCall, 'Should warn about missing download URL');
    });

    it('handles download failures gracefully', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => {
            throw new Error('Network error');
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      // Should not throw
      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('Failed to download')
      );
      assert.ok(warnCall, 'Should warn about download failure');
    });

    it('handles non-ok HTTP responses', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: false,
            statusText: 'Not Found',
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let warnCall = mockDeps.output.calls.find(
        c => c.method === 'warn' && c.args[0].includes('Failed to download')
      );
      assert.ok(warnCall, 'Should warn about HTTP error');
    });

    it('saves baseline metadata after successful downloads', async () => {
      let savedMetadata = null;
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: (_path, data) => {
            savedMetadata = data;
          },
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(10),
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: {
          id: 'build-1',
          name: 'Test Build',
          status: 'completed',
          commit_sha: 'abc123',
        },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
            sha256: 'sha-value',
          },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.ok(savedMetadata, 'Should save baseline metadata');
      assert.strictEqual(savedMetadata.buildId, 'build-1');
      assert.strictEqual(savedMetadata.buildName, 'Test Build');
      assert.ok(savedMetadata.screenshots.length > 0);
    });

    it('saves bundled hotspots from API response', async () => {
      let hotspotsSaved = false;
      let savedHotspots = null;
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
          saveHotspotMetadata: (_dir, hotspots) => {
            hotspotsSaved = true;
            savedHotspots = hotspots;
          },
          saveRegionMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(10),
          }),
        },
      });
      let service = new TddService(
        { apiKey: 'test-key' },
        '/test',
        false,
        null,
        mockDeps
      );

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
        hotspots: {
          test: { regions: [{ y1: 0, y2: 100 }], confidence: 'high' },
        },
        summary: { hotspotsCount: 1 },
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.ok(
        hotspotsSaved,
        'Should save bundled hotspots from API response'
      );
      assert.deepStrictEqual(savedHotspots, apiResponse.hotspots);
    });

    it('skips hotspot save when not in API response', async () => {
      let hotspotsSaved = false;
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
          saveHotspotMetadata: () => {
            hotspotsSaved = true;
          },
          saveRegionMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(10),
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
        // No hotspots in response
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.ok(
        !hotspotsSaved,
        'Should NOT save hotspots when not in API response'
      );
    });

    it('returns null when all downloads fail', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => {
            throw new Error('Network failure');
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      let result = await service.processDownloadedBaselines(
        apiResponse,
        'build-1'
      );

      assert.strictEqual(result, null);
    });

    it('returns baseline data on successful download', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(10),
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      let result = await service.processDownloadedBaselines(
        apiResponse,
        'build-1'
      );

      assert.ok(result, 'Should return baseline data');
      assert.strictEqual(result.buildId, 'build-1');
      assert.strictEqual(result.buildName, 'Test Build');
    });

    it('processes multiple screenshots in batches', async () => {
      let fetchCalls = 0;
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => {
            fetchCalls++;
            return {
              ok: true,
              arrayBuffer: async () => new ArrayBuffer(10),
            };
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      // Create 7 screenshots to test batching (batch size is 5)
      let screenshots = Array.from({ length: 7 }, (_, i) => ({
        name: `test-${i}`,
        filename: `test-${i}.png`,
        original_url: `http://example.com/${i}.png`,
      }));

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots,
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      assert.strictEqual(fetchCalls, 7, 'Should fetch all 7 screenshots');

      // Check batch processing message
      let batchCalls = mockDeps.output.calls.filter(
        c => c.method === 'info' && c.args[0].includes('batch')
      );
      assert.ok(batchCalls.length >= 2, 'Should process in at least 2 batches');
    });

    it('saves baseline-metadata.json for MCP plugin', async () => {
      let writtenFiles = [];
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: (path, data) => writtenFiles.push({ path, data }),
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(10),
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: {
          id: 'build-1',
          name: 'Test Build',
          status: 'completed',
          commit_sha: 'abc123',
          approval_status: 'approved',
        },
        screenshots: [
          {
            name: 'test',
            filename: 'test.png',
            original_url: 'http://example.com/1.png',
          },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let metadataFile = writtenFiles.find(f =>
        f.path.includes('baseline-metadata.json')
      );
      assert.ok(metadataFile, 'Should write baseline-metadata.json');

      let metadata = JSON.parse(metadataFile.data);
      assert.strictEqual(metadata.buildId, 'build-1');
      assert.strictEqual(metadata.commitSha, 'abc123');
    });

    it('logs summary with download counts', async () => {
      let mockDeps = createMockDeps({
        baseline: { clearBaselineData: () => {} },
        fs: {
          existsSync: () => false,
          writeFileSync: () => {},
        },
        metadata: {
          loadBaselineMetadata: () => null,
          saveBaselineMetadata: () => {},
        },
        api: {
          fetchWithTimeout: async () => ({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(10),
          }),
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      let apiResponse = {
        build: { id: 'build-1', name: 'Test Build', status: 'completed' },
        screenshots: [
          {
            name: 'test1',
            filename: 'test1.png',
            original_url: 'http://example.com/1.png',
          },
          {
            name: 'test2',
            filename: 'test2.png',
            original_url: 'http://example.com/2.png',
          },
        ],
      };

      await service.processDownloadedBaselines(apiResponse, 'build-1');

      let summaryCall = mockDeps.output.calls.find(
        c => c.method === 'info' && c.args[0].includes('Downloaded')
      );
      assert.ok(summaryCall, 'Should log download summary');
    });
  });

  describe('downloadHotspots', () => {
    it('skips download when no API key configured', async () => {
      let apiCalled = false;
      let mockDeps = createMockDeps({
        api: {
          getBatchHotspots: async () => {
            apiCalled = true;
            return { hotspots: {} };
          },
        },
      });
      let service = new TddService({}, '/test', false, null, mockDeps);

      await service.downloadHotspots([{ name: 'test' }]);

      assert.ok(!apiCalled, 'Should not call API without apiKey');
    });

    it('fetches hotspots for unique screenshot names', async () => {
      let requestedNames = null;
      let mockDeps = createMockDeps({
        api: {
          getBatchHotspots: async (_client, names) => {
            requestedNames = names;
            return { hotspots: {} };
          },
        },
        metadata: { saveHotspotMetadata: () => {} },
      });
      let service = new TddService(
        { apiKey: 'test-key' },
        '/test',
        false,
        null,
        mockDeps
      );

      await service.downloadHotspots([
        { name: 'test1' },
        { name: 'test1' }, // duplicate
        { name: 'test2' },
      ]);

      assert.deepStrictEqual(requestedNames, ['test1', 'test2']);
    });

    it('saves hotspot data to disk and memory', async () => {
      let savedData = null;
      let mockDeps = createMockDeps({
        api: {
          getBatchHotspots: async () => ({
            hotspots: { test: { regions: [{ y1: 0, y2: 100 }] } },
            summary: { total: 1 },
          }),
        },
        metadata: {
          saveHotspotMetadata: (_workingDir, hotspots, summary) => {
            savedData = { hotspots, summary };
          },
        },
      });
      let service = new TddService(
        { apiKey: 'test-key' },
        '/test',
        false,
        null,
        mockDeps
      );

      await service.downloadHotspots([{ name: 'test' }]);

      assert.ok(savedData, 'Should save hotspot data');
      assert.ok(service.hotspotData, 'Should store in memory');
      assert.deepStrictEqual(service.hotspotData.test.regions, [
        { y1: 0, y2: 100 },
      ]);
    });

    it('handles API errors gracefully', async () => {
      let mockDeps = createMockDeps({
        api: {
          getBatchHotspots: async () => {
            throw new Error('API unavailable');
          },
        },
      });
      let service = new TddService(
        { apiKey: 'test-key' },
        '/test',
        false,
        null,
        mockDeps
      );

      // Should not throw
      await service.downloadHotspots([{ name: 'test' }]);

      let warnCall = mockDeps.output.calls.find(
        c =>
          c.method === 'warn' && c.args[0].includes('Could not fetch hotspot')
      );
      assert.ok(warnCall, 'Should warn about API failure');
    });

    it('skips when no screenshots provided', async () => {
      let apiCalled = false;
      let mockDeps = createMockDeps({
        api: {
          getBatchHotspots: async () => {
            apiCalled = true;
            return { hotspots: {} };
          },
        },
      });
      let service = new TddService(
        { apiKey: 'test-key' },
        '/test',
        false,
        null,
        mockDeps
      );

      await service.downloadHotspots([]);

      assert.ok(!apiCalled, 'Should not call API with empty screenshots');
    });
  });
});
