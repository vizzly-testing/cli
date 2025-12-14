import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  unwrapProperties,
  extractProperties,
  convertPathToUrl,
  groupComparisons,
} from '../../../src/server/handlers/tdd-handler.js';

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
          properties: { browser: 'chrome', viewport_width: 1920, viewport_height: 1080 },
        },
        {
          name: 'test',
          id: '2',
          properties: { browser: 'chrome', viewport_width: 375, viewport_height: 667 },
        },
      ];

      let result = groupComparisons(comparisons);

      let variants = result[0].variants;

      // Should have chrome browser key
      assert.ok(variants['chrome']);
      // Should have two viewport keys under chrome
      assert.ok(variants['chrome']['1920x1080']);
      assert.ok(variants['chrome']['375x667']);
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
          properties: { browser: 'chrome', viewport_width: 1920, viewport_height: 1080 },
        },
        {
          name: 'test',
          id: '2',
          properties: { browser: 'chrome', viewport_width: 375, viewport_height: 667 },
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
});
