import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createTddHandler } from './screenshot-handler.js';

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
 * Create mock TddService for testing
 */
function createMockTddService(overrides = {}) {
  return class MockTddService {
    constructor(config, workingDir, setBaseline) {
      this.config = config;
      this.workingDir = workingDir;
      this.setBaseline = setBaseline;
      this.comparisons = [];
      this.baselineData = null;
    }

    async loadBaseline() {
      return overrides.loadBaseline?.() ?? null;
    }

    async downloadBaselines() {
      return overrides.downloadBaselines?.() ?? null;
    }

    async compareScreenshot(name, imageBuffer, properties) {
      if (overrides.compareScreenshot) {
        return overrides.compareScreenshot(name, imageBuffer, properties);
      }
      return {
        id: `comp-${name}`,
        name,
        status: 'passed',
        baseline: `/baselines/${name}.png`,
        current: `/current/${name}.png`,
        diff: null,
        properties,
      };
    }

    async printResults() {
      return overrides.printResults?.() ?? { total: 0, passed: 0, failed: 0 };
    }

    async acceptBaseline(comparison) {
      return overrides.acceptBaseline?.(comparison) ?? { success: true };
    }

    clearRunData() {
      return overrides.clearRunData?.();
    }
  };
}

/**
 * Create mock dependencies for createTddHandler tests
 */
function createMockDeps(overrides = {}) {
  let mockOutput = createMockOutput();
  let fileSystem = {};

  return {
    TddService:
      overrides.TddService ??
      createMockTddService(overrides.tddServiceOverrides),
    existsSync: overrides.existsSync ?? (path => path in fileSystem),
    readFileSync:
      overrides.readFileSync ??
      (path => {
        if (path in fileSystem) return fileSystem[path];
        throw new Error(`File not found: ${path}`);
      }),
    writeFileSync:
      overrides.writeFileSync ??
      ((path, content) => {
        fileSystem[path] = content;
      }),
    unlinkSync:
      overrides.unlinkSync ??
      (path => {
        delete fileSystem[path];
      }),
    join: overrides.join ?? ((...parts) => parts.join('/')),
    resolve: overrides.resolve ?? (path => path.replace('file://', '')),
    Buffer: overrides.Buffer ?? {
      from: (data, encoding) => ({ data, encoding, length: data.length }),
    },
    getDimensionsSync:
      overrides.getDimensionsSync ?? (() => ({ width: 1920, height: 1080 })),
    detectImageInputType: overrides.detectImageInputType ?? (() => 'base64'),
    sanitizeScreenshotName: overrides.sanitizeScreenshotName ?? (name => name),
    validateScreenshotProperties:
      overrides.validateScreenshotProperties ?? (props => props),
    output: overrides.output ?? mockOutput,
    _fileSystem: fileSystem,
    _mockOutput: mockOutput,
  };
}

describe('server/handlers/tdd-handler', () => {
  describe('handleScreenshot', () => {
    it('does not reinterpret user properties as screenshot options', async () => {
      let comparisonProperties;
      let deps = createMockDeps({
        tddServiceOverrides: {
          compareScreenshot: async (_name, _imageBuffer, properties) => {
            comparisonProperties = properties;
            return {
              id: 'comparison-1',
              name: 'homepage',
              status: 'passed',
              signature: 'homepage|1920|chrome',
              baseline: null,
              current: null,
              diff: null,
              threshold: 0.1,
              minClusterSize: 4,
              diffPercentage: 0,
              diffCount: 0,
            };
          },
        },
      });
      let handler = createTddHandler({}, '/test', null, null, false, deps);

      await handler.handleScreenshot(
        null,
        'homepage',
        'fake-image',
        {
          browser: 'chrome',
          threshold: 0.1,
          properties: {
            theme: 'dark',
            minClusterSize: 4,
          },
        },
        'base64'
      );

      assert.strictEqual(comparisonProperties.threshold, 0.1);
      assert.deepStrictEqual(comparisonProperties.properties, {
        theme: 'dark',
        minClusterSize: 4,
      });
      assert.strictEqual(comparisonProperties.minClusterSize, undefined);
    });
  });

  describe('createTddHandler', () => {
    describe('handleScreenshot', () => {
      it('returns 200 with status match for passed comparison', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'passed',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: null,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'homepage',
          'base64imagedata',
          {}
        );

        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.status, 'match');
        assert.strictEqual(result.body.name, 'homepage');
        assert.strictEqual(result.body.tddMode, true);
      });

      it('returns 200 with status new for new baseline', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'new',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: null,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'new-screenshot',
          'base64imagedata',
          {}
        );

        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.status, 'new');
        assert.strictEqual(result.body.name, 'new-screenshot');
      });

      it('returns 200 with status diff for failed comparison', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'failed',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: '/diffs/test.png',
              diffPercentage: 5.5,
              threshold: 2.0,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'homepage',
          'base64imagedata',
          {}
        );

        // Visual diffs return 200 with status: 'diff' (not 422)
        // This allows SDKs to decide whether to fail tests
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(result.body.status, 'diff');
        assert.strictEqual(result.body.name, 'homepage');
        assert.ok(result.body.message.includes('Visual difference detected'));
        assert.strictEqual(result.body.diffPercentage, 5.5);
        assert.strictEqual(result.body.threshold, 2.0);
        assert.ok(result.body.baseline);
        assert.ok(result.body.current);
        assert.ok(result.body.diff);
      });

      it('returns 400 for invalid screenshot name', async () => {
        let deps = createMockDeps({
          sanitizeScreenshotName: () => {
            throw new Error('Invalid characters');
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'invalid<>name',
          'base64imagedata',
          {}
        );

        assert.strictEqual(result.statusCode, 400);
        assert.ok(result.body.error.includes('Invalid screenshot name'));
      });

      it('returns 400 for invalid properties', async () => {
        let deps = createMockDeps({
          validateScreenshotProperties: () => {
            throw new Error('Invalid property value');
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'base64imagedata',
          { bad: 'props' }
        );

        assert.strictEqual(result.statusCode, 400);
        assert.ok(result.body.error.includes('Invalid screenshot properties'));
      });

      it('handles file path image input', async () => {
        let fileContent = 'fake-png-data';
        let deps = createMockDeps({
          detectImageInputType: () => 'file-path',
          existsSync: () => true,
          readFileSync: () => Buffer.from(fileContent),
          tddServiceOverrides: {
            compareScreenshot: (name, _buffer) => ({
              id: `comp-${name}`,
              name,
              status: 'passed',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: null,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'file:///path/to/screenshot.png',
          {}
        );

        assert.strictEqual(result.statusCode, 200);
      });

      it('returns 400 for missing file', async () => {
        let deps = createMockDeps({
          detectImageInputType: () => 'file-path',
          existsSync: () => false,
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'file:///missing/file.png',
          {}
        );

        assert.strictEqual(result.statusCode, 400);
        assert.ok(result.body.error.includes('not found'));
      });

      it('falls back to detection when type not provided', async () => {
        let detectCalled = false;
        let deps = createMockDeps({
          detectImageInputType: () => {
            detectCalled = true;
            return 'base64';
          },
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'passed',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: null,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        // No type parameter - should call detection
        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'base64imagedata',
          {}
        );

        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(detectCalled, true);
      });

      it('falls back to detection for invalid type values', async () => {
        let detectCalled = false;
        let deps = createMockDeps({
          detectImageInputType: () => {
            detectCalled = true;
            return 'base64';
          },
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'passed',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: null,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        // Invalid type value - should fall back to detection
        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'base64imagedata',
          {},
          'invalid-type'
        );

        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(detectCalled, true);
      });

      it('returns 500 for error comparison', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'error',
              error: 'Comparison failed',
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'base64imagedata',
          {}
        );

        assert.strictEqual(result.statusCode, 500);
        assert.ok(result.body.error.includes('Comparison failed'));
      });

      it('returns 200 for baseline-updated status', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'baseline-updated',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'base64imagedata',
          {}
        );

        assert.strictEqual(result.statusCode, 200);
        assert.ok(result.body.message.includes('Baseline updated'));
      });

      it('returns 400 for unknown image input type', async () => {
        let deps = createMockDeps({
          detectImageInputType: () => 'unknown',
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          12345, // Not a string
          {}
        );

        assert.strictEqual(result.statusCode, 400);
        assert.ok(result.body.error.includes('Invalid image input'));
      });
    });
  });
});
