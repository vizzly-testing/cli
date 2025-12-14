import { describe, expect, it } from 'vitest';
import { groupComparisons } from '../../../src/server/handlers/tdd-handler.js';

describe('tdd-handler', () => {
  describe('groupComparisons', () => {
    it('returns empty array for empty input', () => {
      let result = groupComparisons([]);
      expect(result).toEqual([]);
    });

    it('groups comparisons by screenshot name', () => {
      let comparisons = [
        { name: 'button', status: 'passed', properties: {} },
        { name: 'header', status: 'passed', properties: {} },
        { name: 'button', status: 'failed', properties: {} },
      ];

      let result = groupComparisons(comparisons);

      expect(result).toHaveLength(2);
      let buttonGroup = result.find(g => g.name === 'button');
      let headerGroup = result.find(g => g.name === 'header');

      expect(buttonGroup.comparisons).toHaveLength(2);
      expect(buttonGroup.totalVariants).toBe(2);
      expect(headerGroup.comparisons).toHaveLength(1);
      expect(headerGroup.totalVariants).toBe(1);
    });

    it('tracks unique browsers', () => {
      let comparisons = [
        { name: 'button', properties: { browser: 'chrome' } },
        { name: 'button', properties: { browser: 'firefox' } },
        { name: 'button', properties: { browser: 'chrome' } },
      ];

      let result = groupComparisons(comparisons);

      expect(result[0].browsers).toEqual(['chrome', 'firefox']);
    });

    it('tracks unique viewports', () => {
      let comparisons = [
        { name: 'button', properties: { viewport_width: 1920, viewport_height: 1080 } },
        { name: 'button', properties: { viewport_width: 1280, viewport_height: 720 } },
        { name: 'button', properties: { viewport_width: 1920, viewport_height: 1080 } },
      ];

      let result = groupComparisons(comparisons);

      expect(result[0].viewports).toHaveLength(2);
      expect(result[0].viewports).toContain('1920x1080');
      expect(result[0].viewports).toContain('1280x720');
    });

    it('tracks unique devices', () => {
      let comparisons = [
        { name: 'button', properties: { device: 'iPhone 14' } },
        { name: 'button', properties: { device: 'Pixel 7' } },
        { name: 'button', properties: { device: 'iPhone 14' } },
      ];

      let result = groupComparisons(comparisons);

      expect(result[0].devices).toHaveLength(2);
      expect(result[0].devices).toContain('iPhone 14');
      expect(result[0].devices).toContain('Pixel 7');
    });

    it('builds variants structure by browser and viewport', () => {
      let comparisons = [
        { name: 'button', properties: { browser: 'chrome', viewport_width: 1920, viewport_height: 1080 } },
        { name: 'button', properties: { browser: 'chrome', viewport_width: 1280, viewport_height: 720 } },
        { name: 'button', properties: { browser: 'firefox', viewport_width: 1920, viewport_height: 1080 } },
      ];

      let result = groupComparisons(comparisons);
      let variants = result[0].variants;

      expect(variants.chrome['1920x1080']).toHaveLength(1);
      expect(variants.chrome['1280x720']).toHaveLength(1);
      expect(variants.firefox['1920x1080']).toHaveLength(1);
    });

    it('sets groupingStrategy to browser when multiple browsers', () => {
      let comparisons = [
        { name: 'button', properties: { browser: 'chrome' } },
        { name: 'button', properties: { browser: 'firefox' } },
      ];

      let result = groupComparisons(comparisons);

      expect(result[0].groupingStrategy).toBe('browser');
    });

    it('sets groupingStrategy to viewport when multiple viewports but single browser', () => {
      let comparisons = [
        { name: 'button', properties: { viewport_width: 1920, viewport_height: 1080 } },
        { name: 'button', properties: { viewport_width: 1280, viewport_height: 720 } },
      ];

      let result = groupComparisons(comparisons);

      expect(result[0].groupingStrategy).toBe('viewport');
    });

    it('sets groupingStrategy to flat when single browser and viewport', () => {
      let comparisons = [
        { name: 'button', properties: { browser: 'chrome', viewport_width: 1920, viewport_height: 1080 } },
      ];

      let result = groupComparisons(comparisons);

      expect(result[0].groupingStrategy).toBe('flat');
    });

    it('sorts comparisons by viewport area (largest first)', () => {
      let comparisons = [
        { name: 'button', properties: { viewport_width: 800, viewport_height: 600 } },
        { name: 'button', properties: { viewport_width: 1920, viewport_height: 1080 } },
        { name: 'button', properties: { viewport_width: 1280, viewport_height: 720 } },
      ];

      let result = groupComparisons(comparisons);
      let sorted = result[0].comparisons;

      // 1920x1080 = 2,073,600
      // 1280x720 = 921,600
      // 800x600 = 480,000
      expect(sorted[0].properties.viewport_width).toBe(1920);
      expect(sorted[1].properties.viewport_width).toBe(1280);
      expect(sorted[2].properties.viewport_width).toBe(800);
    });

    it('sorts groups: multi-variant first, then by variant count, then alphabetically', () => {
      let comparisons = [
        { name: 'zebra', properties: {} },
        { name: 'alpha', properties: {} },
        { name: 'beta', properties: { browser: 'chrome' } },
        { name: 'beta', properties: { browser: 'firefox' } },
        { name: 'gamma', properties: { browser: 'chrome' } },
        { name: 'gamma', properties: { browser: 'firefox' } },
        { name: 'gamma', properties: { browser: 'safari' } },
      ];

      let result = groupComparisons(comparisons);
      let names = result.map(g => g.name);

      // gamma (3 variants) first, then beta (2 variants), then alpha, zebra alphabetically
      expect(names).toEqual(['gamma', 'beta', 'alpha', 'zebra']);
    });

    it('handles missing properties gracefully', () => {
      let comparisons = [
        { name: 'button' },
        { name: 'button', properties: null },
        { name: 'button', properties: {} },
      ];

      let result = groupComparisons(comparisons);

      expect(result).toHaveLength(1);
      expect(result[0].comparisons).toHaveLength(3);
      expect(result[0].browsers).toEqual([]);
      expect(result[0].viewports).toEqual([]);
      expect(result[0].devices).toEqual([]);
    });

    it('handles null browser/viewport in variants', () => {
      let comparisons = [
        { name: 'button', properties: {} },
        { name: 'button', properties: { browser: 'chrome' } },
      ];

      let result = groupComparisons(comparisons);
      let variants = result[0].variants;

      expect(variants[null]).toBeDefined();
      expect(variants[null][null]).toHaveLength(1);
      expect(variants.chrome).toBeDefined();
    });
  });
});
