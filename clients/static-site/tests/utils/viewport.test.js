/**
 * Tests for viewport utilities
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  formatViewport,
  getCommonViewports,
  parseViewport,
  setViewport,
} from '../../src/utils/viewport.js';

describe('viewport', () => {
  describe('parseViewport', () => {
    it('parses viewport string', () => {
      let viewport = parseViewport('mobile:375x667');

      assert.deepStrictEqual(viewport, {
        name: 'mobile',
        width: 375,
        height: 667,
      });
    });

    it('handles different viewport formats', () => {
      let viewport1 = parseViewport('desktop:1920x1080');
      let viewport2 = parseViewport('tablet:768x1024');

      assert.strictEqual(viewport1.name, 'desktop');
      assert.strictEqual(viewport1.width, 1920);
      assert.strictEqual(viewport1.height, 1080);

      assert.strictEqual(viewport2.name, 'tablet');
      assert.strictEqual(viewport2.width, 768);
      assert.strictEqual(viewport2.height, 1024);
    });

    it('returns null for invalid format', () => {
      assert.strictEqual(parseViewport('invalid'), null);
      assert.strictEqual(parseViewport('mobile:375'), null);
      assert.strictEqual(parseViewport('mobile:375x'), null);
      assert.strictEqual(parseViewport(':375x667'), null);
    });

    it('returns null for non-numeric dimensions', () => {
      assert.strictEqual(parseViewport('mobile:abcxdef'), null);
      assert.strictEqual(parseViewport('mobile:375xabc'), null);
    });

    it('handles whitespace', () => {
      let viewport = parseViewport('  mobile:375x667  ');

      assert.deepStrictEqual(viewport, {
        name: 'mobile',
        width: 375,
        height: 667,
      });
    });
  });

  describe('formatViewport', () => {
    it('formats viewport object to string', () => {
      let viewport = { name: 'mobile', width: 375, height: 667 };

      let formatted = formatViewport(viewport);

      assert.strictEqual(formatted, 'mobile:375x667');
    });

    it('returns empty string for invalid viewport', () => {
      assert.strictEqual(formatViewport(null), '');
      assert.strictEqual(formatViewport(undefined), '');
      assert.strictEqual(formatViewport({}), '');
      assert.strictEqual(formatViewport({ name: 'mobile' }), '');
      assert.strictEqual(formatViewport({ width: 375, height: 667 }), '');
    });

    it('handles zero values as missing', () => {
      let viewport = { name: 'test', width: 0, height: 667 };

      let formatted = formatViewport(viewport);

      assert.strictEqual(formatted, '');
    });
  });

  describe('setViewport', () => {
    it('calls page.setViewport with width and height', async () => {
      let calledWith = null;
      let mockPage = {
        setViewport: async opts => {
          calledWith = opts;
        },
      };
      let viewport = { name: 'desktop', width: 1920, height: 1080 };

      await setViewport(mockPage, viewport);

      assert.deepStrictEqual(calledWith, { width: 1920, height: 1080 });
    });
  });

  describe('getCommonViewports', () => {
    it('returns array of common viewport presets', () => {
      let viewports = getCommonViewports();

      assert.ok(Array.isArray(viewports));
      assert.ok(viewports.length >= 3);
    });

    it('includes mobile, tablet, and desktop', () => {
      let viewports = getCommonViewports();

      let names = viewports.map(v => v.name);
      assert.ok(names.includes('mobile'));
      assert.ok(names.includes('tablet'));
      assert.ok(names.includes('desktop'));
    });

    it('returns viewports with valid dimensions', () => {
      let viewports = getCommonViewports();

      viewports.forEach(viewport => {
        assert.ok(viewport.name);
        assert.ok(viewport.width > 0);
        assert.ok(viewport.height > 0);
      });
    });
  });
});
