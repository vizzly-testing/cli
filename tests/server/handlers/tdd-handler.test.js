import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  convertPathToUrl,
  createTddHandler,
  extractProperties,
  groupComparisons,
  unwrapProperties,
} from '../../../src/server/handlers/tdd-handler.js';

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
    mkdirSync:
      overrides.mkdirSync ??
      (() => {
        // No-op for virtual file system
      }),
    unlinkSync:
      overrides.unlinkSync ??
      (path => {
        delete fileSystem[path];
      }),
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
    stateBackend: overrides.stateBackend ?? 'file',
    _fileSystem: fileSystem,
    _mockOutput: mockOutput,
  };
}

describe('server/handlers/tdd-handler', () => {
  describe('unwrapProperties', () => {
    it('returns empty object for null/undefined', () => {
      assert.deepStrictEqual(unwrapProperties(null), {});
      assert.deepStrictEqual(unwrapProperties(undefined), {});
    });

    it('returns properties as-is when not double-nested', () => {
      let props = { browser: 'chrome', viewport: { width: 1920 } };
      assert.deepStrictEqual(unwrapProperties(props), props);
    });

    it('unwraps double-nested properties', () => {
      let props = {
        properties: {
          browser: 'chrome',
          viewport: { width: 1920, height: 1080 },
        },
      };

      let result = unwrapProperties(props);

      assert.strictEqual(result.browser, 'chrome');
      assert.strictEqual(result.viewport.width, 1920);
      assert.strictEqual(result.properties, undefined);
    });

    it('merges top-level and nested properties', () => {
      let props = {
        topLevel: 'value',
        properties: {
          browser: 'firefox',
        },
      };

      let result = unwrapProperties(props);

      assert.strictEqual(result.topLevel, 'value');
      assert.strictEqual(result.browser, 'firefox');
      assert.strictEqual(result.properties, undefined);
    });
  });

  describe('extractProperties', () => {
    it('returns empty object for null/undefined', () => {
      assert.deepStrictEqual(extractProperties(null), {});
      assert.deepStrictEqual(extractProperties(undefined), {});
    });

    it('extracts viewport from nested structure', () => {
      let props = {
        browser: 'chrome',
        viewport: { width: 1920, height: 1080 },
      };

      let result = extractProperties(props);

      assert.strictEqual(result.viewport_width, 1920);
      assert.strictEqual(result.viewport_height, 1080);
      assert.strictEqual(result.browser, 'chrome');
    });

    it('uses top-level viewport_width/height if present', () => {
      let props = {
        viewport_width: 1280,
        viewport_height: 720,
      };

      let result = extractProperties(props);

      assert.strictEqual(result.viewport_width, 1280);
      assert.strictEqual(result.viewport_height, 720);
    });

    it('prefers nested viewport over top-level', () => {
      let props = {
        viewport: { width: 1920, height: 1080 },
        viewport_width: 1280,
        viewport_height: 720,
      };

      let result = extractProperties(props);

      // Nested viewport.width takes precedence
      assert.strictEqual(result.viewport_width, 1920);
      assert.strictEqual(result.viewport_height, 1080);
    });

    it('sets null for missing values', () => {
      let result = extractProperties({});

      assert.strictEqual(result.viewport_width, null);
      assert.strictEqual(result.viewport_height, null);
      assert.strictEqual(result.browser, null);
    });

    it('preserves metadata field', () => {
      let props = { browser: 'safari' };
      let result = extractProperties(props);

      assert.deepStrictEqual(result.metadata, props);
    });
  });

  describe('convertPathToUrl', () => {
    it('returns null for null/undefined path', () => {
      assert.strictEqual(convertPathToUrl(null, '/path'), null);
      assert.strictEqual(convertPathToUrl(undefined, '/path'), null);
    });

    it('converts absolute path to image URL', () => {
      let vizzlyDir = '/project/.vizzly';
      let filePath = '/project/.vizzly/baselines/screenshot.png';

      let result = convertPathToUrl(filePath, vizzlyDir);

      assert.strictEqual(result, '/images/baselines/screenshot.png');
    });

    it('returns path unchanged if not in vizzly dir', () => {
      let vizzlyDir = '/project/.vizzly';
      let filePath = '/other/path/image.png';

      let result = convertPathToUrl(filePath, vizzlyDir);

      assert.strictEqual(result, filePath);
    });

    it('handles nested paths correctly', () => {
      let vizzlyDir = '/home/user/project/.vizzly';
      let filePath = '/home/user/project/.vizzly/diffs/test/screenshot.png';

      let result = convertPathToUrl(filePath, vizzlyDir);

      assert.strictEqual(result, '/images/diffs/test/screenshot.png');
    });
  });

  describe('groupComparisons', () => {
    it('returns empty array for no comparisons', () => {
      let result = groupComparisons([]);

      assert.deepStrictEqual(result, []);
    });

    it('groups comparisons by name', () => {
      let comparisons = [
        { name: 'button', id: '1', properties: {} },
        { name: 'header', id: '2', properties: {} },
        { name: 'button', id: '3', properties: {} },
      ];

      let result = groupComparisons(comparisons);

      // Should have 2 groups
      assert.strictEqual(result.length, 2);

      // Button group should have 2 comparisons
      let buttonGroup = result.find(g => g.name === 'button');
      assert.strictEqual(buttonGroup.comparisons.length, 2);
      assert.strictEqual(buttonGroup.totalVariants, 2);

      // Header group should have 1 comparison
      let headerGroup = result.find(g => g.name === 'header');
      assert.strictEqual(headerGroup.comparisons.length, 1);
    });

    it('tracks unique browsers, viewports, and devices', () => {
      let comparisons = [
        {
          name: 'test',
          id: '1',
          properties: {
            browser: 'chrome',
            viewport_width: 1920,
            viewport_height: 1080,
            device: 'desktop',
          },
        },
        {
          name: 'test',
          id: '2',
          properties: {
            browser: 'firefox',
            viewport_width: 1920,
            viewport_height: 1080,
            device: 'desktop',
          },
        },
        {
          name: 'test',
          id: '3',
          properties: {
            browser: 'chrome',
            viewport_width: 375,
            viewport_height: 667,
            device: 'mobile',
          },
        },
      ];

      let result = groupComparisons(comparisons);

      assert.strictEqual(result.length, 1);

      let group = result[0];
      assert.deepStrictEqual(group.browsers.sort(), ['chrome', 'firefox']);
      assert.deepStrictEqual(group.viewports.sort(), ['1920x1080', '375x667']);
      assert.deepStrictEqual(group.devices.sort(), ['desktop', 'mobile']);
    });

    it('builds variants structure', () => {
      let comparisons = [
        {
          name: 'test',
          id: '1',
          properties: {
            browser: 'chrome',
            viewport_width: 1920,
            viewport_height: 1080,
          },
        },
        {
          name: 'test',
          id: '2',
          properties: {
            browser: 'chrome',
            viewport_width: 375,
            viewport_height: 667,
          },
        },
      ];

      let result = groupComparisons(comparisons);

      let variants = result[0].variants;

      // Should have chrome browser key
      assert.ok(variants.chrome);
      // Should have two viewport keys under chrome
      assert.ok(variants.chrome['1920x1080']);
      assert.ok(variants.chrome['375x667']);
    });

    it('determines grouping strategy correctly', () => {
      // Single variant - flat
      let single = groupComparisons([
        { name: 'test', id: '1', properties: { browser: 'chrome' } },
      ]);
      assert.strictEqual(single[0].groupingStrategy, 'flat');

      // Multiple browsers - browser grouping
      let multiBrowser = groupComparisons([
        { name: 'test', id: '1', properties: { browser: 'chrome' } },
        { name: 'test', id: '2', properties: { browser: 'firefox' } },
      ]);
      assert.strictEqual(multiBrowser[0].groupingStrategy, 'browser');

      // Multiple viewports, same browser - viewport grouping
      let multiViewport = groupComparisons([
        {
          name: 'test',
          id: '1',
          properties: {
            browser: 'chrome',
            viewport_width: 1920,
            viewport_height: 1080,
          },
        },
        {
          name: 'test',
          id: '2',
          properties: {
            browser: 'chrome',
            viewport_width: 375,
            viewport_height: 667,
          },
        },
      ]);
      assert.strictEqual(multiViewport[0].groupingStrategy, 'viewport');
    });

    it('sorts comparisons by viewport area (largest first)', () => {
      let comparisons = [
        {
          name: 'test',
          id: '1',
          properties: { viewport_width: 375, viewport_height: 667 },
        },
        {
          name: 'test',
          id: '2',
          properties: { viewport_width: 1920, viewport_height: 1080 },
        },
        {
          name: 'test',
          id: '3',
          properties: { viewport_width: 768, viewport_height: 1024 },
        },
      ];

      let result = groupComparisons(comparisons);
      let sorted = result[0].comparisons;

      // Largest area first: 1920*1080 > 768*1024 > 375*667
      assert.strictEqual(sorted[0].properties.viewport_width, 1920);
      assert.strictEqual(sorted[1].properties.viewport_width, 768);
      assert.strictEqual(sorted[2].properties.viewport_width, 375);
    });

    it('sorts groups: multi-variant first, then alphabetically', () => {
      let comparisons = [
        { name: 'zebra', id: '1', properties: {} },
        { name: 'apple', id: '2', properties: {} },
        { name: 'multi', id: '3', properties: { browser: 'chrome' } },
        { name: 'multi', id: '4', properties: { browser: 'firefox' } },
        { name: 'multi', id: '5', properties: { browser: 'safari' } },
      ];

      let result = groupComparisons(comparisons);

      // Multi-variant group should come first
      assert.strictEqual(result[0].name, 'multi');
      assert.strictEqual(result[0].totalVariants, 3);

      // Singles should be sorted alphabetically
      assert.strictEqual(result[1].name, 'apple');
      assert.strictEqual(result[2].name, 'zebra');
    });

    it('handles comparisons with null properties', () => {
      let comparisons = [
        { name: 'test', id: '1', properties: null },
        { name: 'test', id: '2' },
      ];

      // Should not throw
      let result = groupComparisons(comparisons);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].totalVariants, 2);
    });
  });

  describe('createTddHandler', () => {
    it('creates handler with all required methods', () => {
      let deps = createMockDeps();
      let handler = createTddHandler({}, '/test', null, null, false, deps);

      assert.ok(typeof handler.initialize === 'function');
      assert.ok(typeof handler.handleScreenshot === 'function');
      assert.ok(typeof handler.getResults === 'function');
      assert.ok(typeof handler.acceptBaseline === 'function');
      assert.ok(typeof handler.rejectBaseline === 'function');
      assert.ok(typeof handler.acceptAllBaselines === 'function');
      assert.ok(typeof handler.resetBaselines === 'function');
      assert.ok(typeof handler.cleanup === 'function');
      assert.ok(handler.tddService);
    });

    describe('initialize', () => {
      it('skips loading in setBaseline mode', async () => {
        let deps = createMockDeps();
        let handler = createTddHandler({}, '/test', null, null, true, deps);

        await handler.initialize();

        let debugCall = deps._mockOutput.calls.find(
          c =>
            c.method === 'debug' && c.args[1]?.includes('baseline update mode')
        );
        assert.ok(debugCall);
      });

      it('downloads baselines when build ID provided with API key', async () => {
        let downloadCalled = false;
        let deps = createMockDeps({
          tddServiceOverrides: {
            downloadBaselines: () => {
              downloadCalled = true;
              return null;
            },
          },
        });
        let handler = createTddHandler(
          { apiKey: 'test-key' },
          '/test',
          'build-123',
          null,
          false,
          deps
        );

        await handler.initialize();

        assert.strictEqual(downloadCalled, true);
      });

      it('loads local baseline when no override flags', async () => {
        let loadCalled = false;
        let deps = createMockDeps({
          tddServiceOverrides: {
            loadBaseline: () => {
              loadCalled = true;
              return { buildName: 'Local Build' };
            },
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await handler.initialize();

        assert.strictEqual(loadCalled, true);
      });
    });

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

      it('returns diff response with all required fields for SDK consumption', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'failed',
              baseline: '/test/.vizzly/baselines/homepage.png',
              current: '/test/.vizzly/current/homepage.png',
              diff: '/test/.vizzly/diffs/homepage.png',
              diffPercentage: 12.34,
              threshold: 5.0,
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

        // Verify the response has all fields SDKs need
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(typeof result.body.status, 'string');
        assert.strictEqual(typeof result.body.name, 'string');
        assert.strictEqual(typeof result.body.message, 'string');
        assert.strictEqual(typeof result.body.diffPercentage, 'number');
        assert.strictEqual(typeof result.body.threshold, 'number');
        assert.strictEqual(result.body.tddMode, true);
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

      it('uses explicit type parameter instead of detection', async () => {
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

        // Pass explicit type='base64' - detection should not be called
        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'base64imagedata',
          {},
          'base64'
        );

        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(detectCalled, false);
      });

      it('uses explicit file-path type parameter', async () => {
        let detectCalled = false;
        let deps = createMockDeps({
          detectImageInputType: () => {
            detectCalled = true;
            return 'base64'; // Would return wrong type if called
          },
          existsSync: () => true,
          readFileSync: () => Buffer.from('fake-png-data'),
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

        // Pass explicit type='file-path' - detection should not be called
        let result = await handler.handleScreenshot(
          'build-1',
          'test',
          'file:///path/to/screenshot.png',
          {},
          'file-path'
        );

        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(detectCalled, false);
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

      it('logs screenshot event with normalized status for menubar consumption', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'failed',
              diffPercentage: 5.5,
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: '/diffs/test.png',
              threshold: 2.0,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await handler.handleScreenshot('build-1', 'homepage', 'base64data', {});

        // Find the screenshot log - menubar looks for logs starting with "Screenshot:"
        let screenshotLog = deps._mockOutput.calls.find(
          c => c.method === 'info' && c.args[0].startsWith('Screenshot:')
        );

        assert.ok(screenshotLog, 'Screenshot event should be logged');
        assert.strictEqual(screenshotLog.args[1].screenshot, 'homepage');
        // Status should be normalized to 'diff' (not 'failed') to match HTTP response
        assert.strictEqual(screenshotLog.args[1].status, 'diff');
        assert.strictEqual(screenshotLog.args[1].diffPercentage, 5.5);
      });

      it('logs passed screenshots with match-equivalent status', async () => {
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

        await handler.handleScreenshot('build-1', 'button', 'base64data', {});

        let screenshotLog = deps._mockOutput.calls.find(
          c => c.method === 'info' && c.args[0].startsWith('Screenshot:')
        );

        assert.ok(screenshotLog);
        assert.strictEqual(screenshotLog.args[1].status, 'passed');
        assert.strictEqual(screenshotLog.args[1].diffPercentage, 0);
      });

      it('logs new baseline screenshots', async () => {
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

        await handler.handleScreenshot(
          'build-1',
          'new-component',
          'base64data',
          {}
        );

        let screenshotLog = deps._mockOutput.calls.find(
          c => c.method === 'info' && c.args[0].startsWith('Screenshot:')
        );

        assert.ok(screenshotLog);
        assert.strictEqual(screenshotLog.args[1].status, 'new');
      });
    });

    describe('getResults', () => {
      it('returns results from tddService', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            printResults: () => ({ total: 5, passed: 3, failed: 2 }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let results = await handler.getResults();

        assert.strictEqual(results.total, 5);
        assert.strictEqual(results.passed, 3);
        assert.strictEqual(results.failed, 2);
      });
    });

    describe('acceptBaseline', () => {
      it('accepts baseline for existing comparison', async () => {
        let acceptedComparison = null;
        let deps = createMockDeps({
          tddServiceOverrides: {
            acceptBaseline: comp => {
              acceptedComparison = comp;
              return { success: true };
            },
          },
        });

        // Pre-populate report data with a comparison
        let reportData = {
          timestamp: Date.now(),
          comparisons: [{ id: 'comp-1', name: 'test', status: 'failed' }],
          groups: [],
          summary: { total: 1, passed: 0, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.acceptBaseline('comp-1');

        assert.ok(result.success);
        assert.strictEqual(acceptedComparison.id, 'comp-1');
      });

      it('throws error for non-existent comparison', async () => {
        let deps = createMockDeps();
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await assert.rejects(
          () => handler.acceptBaseline('non-existent'),
          /Comparison not found/
        );
      });

      it('logs screenshot event on acceptance for menubar consumption', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            acceptBaseline: () => ({ success: true }),
          },
        });

        let reportData = {
          timestamp: Date.now(),
          comparisons: [
            {
              id: 'comp-1',
              name: 'login-form',
              status: 'failed',
              diffPercentage: 2.1,
            },
          ],
          groups: [],
          summary: { total: 1, passed: 0, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await handler.acceptBaseline('comp-1');

        // Menubar looks for screenshot logs with structured metadata
        let screenshotLog = deps._mockOutput.calls.find(
          c => c.method === 'info' && c.args[0].startsWith('Screenshot:')
        );
        assert.ok(screenshotLog, 'Screenshot event should be logged');
        assert.strictEqual(screenshotLog.args[1].screenshot, 'login-form');
        assert.strictEqual(screenshotLog.args[1].status, 'accepted');
        assert.strictEqual(screenshotLog.args[1].diffPercentage, 0);
      });
    });

    describe('rejectBaseline', () => {
      it('rejects baseline for existing comparison', async () => {
        let deps = createMockDeps();

        // Pre-populate report data with a failed comparison
        let reportData = {
          timestamp: Date.now(),
          comparisons: [
            {
              id: 'comp-1',
              name: 'test',
              status: 'failed',
              diffPercentage: 5.5,
              diff: '/images/diffs/test.png',
            },
          ],
          groups: [],
          summary: { total: 1, passed: 0, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.rejectBaseline('comp-1');

        assert.ok(result.success);
        assert.strictEqual(result.id, 'comp-1');

        // Check that comparison was updated to rejected status
        let updatedReportData = JSON.parse(
          deps._fileSystem['/test/.vizzly/report-data.json']
        );
        let comparison = updatedReportData.comparisons.find(
          c => c.id === 'comp-1'
        );
        assert.strictEqual(comparison.status, 'rejected');
      });

      it('throws error for non-existent comparison', async () => {
        let deps = createMockDeps();
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await assert.rejects(
          () => handler.rejectBaseline('non-existent'),
          /Comparison not found/
        );
      });

      it('preserves other comparison fields when rejecting', async () => {
        let deps = createMockDeps();

        let reportData = {
          timestamp: Date.now(),
          comparisons: [
            {
              id: 'comp-1',
              name: 'test',
              status: 'failed',
              diffPercentage: 5.5,
              diff: '/images/diffs/test.png',
              baseline: '/images/baselines/test.png',
              current: '/images/current/test.png',
              properties: { browser: 'chrome' },
            },
          ],
          groups: [],
          summary: { total: 1, passed: 0, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await handler.rejectBaseline('comp-1');

        let updatedReportData = JSON.parse(
          deps._fileSystem['/test/.vizzly/report-data.json']
        );
        let comparison = updatedReportData.comparisons.find(
          c => c.id === 'comp-1'
        );

        // Status should be rejected
        assert.strictEqual(comparison.status, 'rejected');
        // Other fields should be preserved
        assert.strictEqual(comparison.diffPercentage, 5.5);
        assert.strictEqual(comparison.diff, '/images/diffs/test.png');
        assert.strictEqual(comparison.baseline, '/images/baselines/test.png');
        assert.strictEqual(comparison.properties.browser, 'chrome');
      });

      it('logs screenshot event on rejection for menubar consumption', async () => {
        let deps = createMockDeps();

        let reportData = {
          timestamp: Date.now(),
          comparisons: [
            {
              id: 'comp-1',
              name: 'button-hover',
              status: 'failed',
              diffPercentage: 3.2,
            },
          ],
          groups: [],
          summary: { total: 1, passed: 0, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await handler.rejectBaseline('comp-1');

        // Menubar looks for screenshot logs with structured metadata
        let screenshotLog = deps._mockOutput.calls.find(
          c => c.method === 'info' && c.args[0].startsWith('Screenshot:')
        );
        assert.ok(screenshotLog, 'Screenshot event should be logged');
        assert.strictEqual(screenshotLog.args[1].screenshot, 'button-hover');
        assert.strictEqual(screenshotLog.args[1].status, 'rejected');
        assert.strictEqual(screenshotLog.args[1].diffPercentage, 3.2);
      });
    });

    describe('acceptAllBaselines', () => {
      it('accepts all failed and new comparisons', async () => {
        let acceptedIds = [];
        let deps = createMockDeps({
          tddServiceOverrides: {
            acceptBaseline: comp => {
              acceptedIds.push(comp.id);
              return { success: true };
            },
          },
        });

        let reportData = {
          timestamp: Date.now(),
          comparisons: [
            { id: 'comp-1', name: 'test1', status: 'failed' },
            { id: 'comp-2', name: 'test2', status: 'passed' },
            { id: 'comp-3', name: 'test3', status: 'new' },
          ],
          groups: [],
          summary: { total: 3, passed: 1, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.acceptAllBaselines();

        assert.strictEqual(result.count, 2);
        assert.ok(acceptedIds.includes('comp-1'));
        assert.ok(acceptedIds.includes('comp-3'));
        assert.ok(!acceptedIds.includes('comp-2')); // Already passed
      });
    });

    describe('resetBaselines', () => {
      it('clears report data and returns counts', async () => {
        let _deletedFiles = [];
        let deps = createMockDeps({
          existsSync: path => {
            // Simulate existing files
            return (
              path.includes('baselines') ||
              path.includes('current') ||
              path.includes('diffs') ||
              path.includes('metadata.json')
            );
          },
        });

        let reportData = {
          timestamp: Date.now(),
          comparisons: [
            {
              id: 'comp-1',
              name: 'test',
              baseline: '/images/baselines/test.png',
              current: '/images/current/test.png',
              diff: '/images/diffs/test.png',
            },
          ],
          groups: [],
          summary: { total: 1, passed: 0, failed: 1, errors: 0 },
        };
        deps._fileSystem['/test/.vizzly/report-data.json'] =
          JSON.stringify(reportData);

        let handler = createTddHandler({}, '/test', null, null, false, deps);

        let result = await handler.resetBaselines();

        assert.ok(result.success);
        // Check report was cleared
        let newReportData = JSON.parse(
          deps._fileSystem['/test/.vizzly/report-data.json']
        );
        assert.strictEqual(newReportData.comparisons.length, 0);
      });
    });

    describe('cleanup', () => {
      it('cleanup function exists and can be called', () => {
        let deps = createMockDeps();
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        // Should not throw
        handler.cleanup();
      });
    });

    describe('readReportData / updateComparison', () => {
      it('creates empty report data when file does not exist', async () => {
        let deps = createMockDeps();
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        // Trigger a screenshot which calls updateComparison
        await handler.handleScreenshot('build-1', 'test', 'base64data', {});

        // Check report was created
        let reportData = JSON.parse(
          deps._fileSystem['/test/.vizzly/report-data.json']
        );
        assert.ok(reportData.timestamp);
        assert.ok(Array.isArray(reportData.comparisons));
      });

      it('excludes heavy fields from report-data.json and writes them to comparison-details.json', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: `comp-${name}`,
              name,
              status: 'failed',
              signature: `${name}|1920|chrome`,
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: '/diffs/test.png',
              diffPercentage: 5.5,
              threshold: 0.1,
              diffClusters: [
                { x: 10, y: 20, width: 100, height: 50, pixelCount: 500 },
              ],
              intensityStats: { mean: 0.3, max: 0.8 },
              boundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
              regionAnalysis: { totalRegions: 1 },
              hotspotAnalysis: { coverage: 0.9 },
              confirmedRegions: [{ id: 'r1', label: 'header' }],
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        await handler.handleScreenshot('build-1', 'test', 'base64data', {});

        // report-data.json should NOT contain heavy fields
        let reportData = JSON.parse(
          deps._fileSystem['/test/.vizzly/report-data.json']
        );
        let comparison = reportData.comparisons[0];
        assert.strictEqual(comparison.diffClusters, undefined);
        assert.strictEqual(comparison.intensityStats, undefined);
        assert.strictEqual(comparison.boundingBox, undefined);
        assert.strictEqual(comparison.regionAnalysis, undefined);
        assert.strictEqual(comparison.hotspotAnalysis, undefined);
        assert.strictEqual(comparison.confirmedRegions, undefined);

        // But should have boolean hints
        assert.strictEqual(comparison.hasDiffClusters, true);
        assert.strictEqual(comparison.hasConfirmedRegions, true);

        // And should still have lightweight fields
        assert.strictEqual(comparison.diffPercentage, 5.5);
        assert.strictEqual(comparison.threshold, 0.1);
        assert.strictEqual(comparison.status, 'failed');

        // comparison-details.json SHOULD contain heavy fields
        let details = JSON.parse(
          deps._fileSystem['/test/.vizzly/comparison-details.json']
        );
        assert.ok(details['comp-test']);
        assert.strictEqual(details['comp-test'].diffClusters.length, 1);
        assert.strictEqual(details['comp-test'].confirmedRegions.length, 1);
        assert.deepStrictEqual(details['comp-test'].intensityStats, {
          mean: 0.3,
          max: 0.8,
        });
      });

      it('updates existing comparison by ID', async () => {
        let deps = createMockDeps({
          tddServiceOverrides: {
            compareScreenshot: name => ({
              id: 'same-id',
              name,
              status: 'passed',
              baseline: '/baselines/test.png',
              current: '/current/test.png',
              diff: null,
            }),
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        // First screenshot
        await handler.handleScreenshot('build-1', 'test', 'base64data', {});

        // Same ID, should update not add
        await handler.handleScreenshot('build-1', 'test', 'base64data', {});

        let reportData = JSON.parse(
          deps._fileSystem['/test/.vizzly/report-data.json']
        );
        assert.strictEqual(reportData.comparisons.length, 1);
      });

      it('handles read error gracefully', async () => {
        let deps = createMockDeps({
          existsSync: () => true,
          readFileSync: () => {
            throw new Error('Read error');
          },
        });
        let handler = createTddHandler({}, '/test', null, null, false, deps);

        // Should not throw, returns empty data
        await handler.handleScreenshot('build-1', 'test', 'base64data', {});

        let errorCall = deps._mockOutput.calls.find(
          c =>
            c.method === 'error' &&
            (c.args[0].includes('Failed to read') ||
              c.args[0].includes('Failed to update comparison'))
        );
        assert.ok(errorCall);
      });
    });
  });
});
