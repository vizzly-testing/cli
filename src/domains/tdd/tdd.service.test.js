import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TddService } from './tdd.service.js';

let validImage = readFileSync(
  new URL(
    '../../../tests/reporter/fixtures/images/screenshots/pricing-page.png',
    import.meta.url
  )
);

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
      success: s => s,
      error: s => s,
      warning: s => s,
      info: s => s,
      dim: s => s,
      bold: s => s,
      underline: s => s,
      brand: {
        success: s => s,
        warning: s => s,
        danger: s => s,
        error: s => s,
        info: s => s,
        textTertiary: s => s,
        textMuted: s => s,
      },
    },
    validatePathSecurity: overrides.validatePathSecurity ?? (path => path),
    initializeDirectories:
      overrides.initializeDirectories ??
      (() => ({
        baselinePath: '/test/.vizzly/baselines',
        currentPath: '/test/.vizzly/current',
        diffPath: '/test/.vizzly/diffs',
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
  describe('loadBaseline', () => {
    it('returns null in setBaseline mode', async () => {
      let mockDeps = createMockDeps();
      let service = new TddService({}, '/test', true, null, mockDeps);

      let result = await service.loadBaseline();

      assert.strictEqual(result, null);
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

    it('preserves exact-match threshold from baseline metadata', async () => {
      let metadata = {
        buildId: 'build-123',
        threshold: 0,
        screenshots: [],
      };
      let mockDeps = createMockDeps({
        metadata: { loadBaselineMetadata: () => metadata },
      });
      let service = new TddService(
        { comparison: { threshold: 2.0 } },
        '/test',
        false,
        null,
        mockDeps
      );

      await service.loadBaseline();

      assert.strictEqual(service.threshold, 0);
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

  describe('daemon result lifecycle', () => {
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
      let imageBuffer = validImage;

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

      let result = await service.compareScreenshot('homepage', validImage, {
        invalid: 'prop',
      });

      assert.strictEqual(result.status, 'new');
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

      await service.compareScreenshot(
        'homepage',
        Buffer.from('test'),
        {},
        { threshold: 5.0 }
      );

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

      await service.compareScreenshot('homepage', validImage, {
        viewport: { width: 1920, height: 1080 },
      });

      assert.strictEqual(capturedProperties.viewport_width, 1920);
    });
  });
});
