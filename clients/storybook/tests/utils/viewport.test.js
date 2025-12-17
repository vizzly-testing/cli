/**
 * Tests for viewport utilities
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatViewport,
  getCommonViewports,
  parseViewport,
} from '../../src/utils/viewport.js';

describe('parseViewport', () => {
  it('should parse valid viewport string', () => {
    let viewport = parseViewport('mobile:375x667');

    assert.deepEqual(viewport, {
      name: 'mobile',
      width: 375,
      height: 667,
    });
  });

  it('should parse viewport with spaces', () => {
    let viewport = parseViewport('  desktop : 1920 x 1080  ');

    assert.deepEqual(viewport, {
      name: 'desktop',
      width: 1920,
      height: 1080,
    });
  });

  it('should return null for invalid format', () => {
    assert.strictEqual(parseViewport('invalid'), null);
    assert.strictEqual(parseViewport('mobile-375x667'), null);
    assert.strictEqual(parseViewport('mobile:375'), null);
  });

  it('should return null for non-string input', () => {
    assert.strictEqual(parseViewport(null), null);
    assert.strictEqual(parseViewport(undefined), null);
    assert.strictEqual(parseViewport(123), null);
  });
});

describe('formatViewport', () => {
  it('should format viewport object', () => {
    let formatted = formatViewport({
      name: 'mobile',
      width: 375,
      height: 667,
    });

    assert.strictEqual(formatted, 'mobile:375x667');
  });

  it('should return empty string for invalid input', () => {
    assert.strictEqual(formatViewport(null), '');
    assert.strictEqual(formatViewport({}), '');
    assert.strictEqual(formatViewport({ name: 'test' }), '');
  });
});

describe('getCommonViewports', () => {
  it('should return array of common viewports', () => {
    let viewports = getCommonViewports();

    assert.ok(Array.isArray(viewports));
    assert.ok(viewports.length > 0);
    assert.ok('name' in viewports[0]);
    assert.ok('width' in viewports[0]);
    assert.ok('height' in viewports[0]);
  });
});
