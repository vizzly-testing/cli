/**
 * Tests for viewport utilities
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  formatViewport,
  getCommonViewports,
  parseViewport,
  setViewport,
} from '../src/utils/viewport.js';

describe('parseViewport', () => {
  it('should parse valid viewport string', () => {
    let viewport = parseViewport('mobile:375x667');

    assert.deepEqual(viewport, {
      name: 'mobile',
      width: 375,
      height: 667,
    });
  });

  it('should handle viewport with spaces', () => {
    let viewport = parseViewport('  desktop : 1920 x 1080  ');

    assert.deepEqual(viewport, {
      name: 'desktop',
      width: 1920,
      height: 1080,
    });
  });

  it('should return null for empty string', () => {
    assert.equal(parseViewport(''), null);
  });

  it('should return null for null input', () => {
    assert.equal(parseViewport(null), null);
  });

  it('should return null for undefined input', () => {
    assert.equal(parseViewport(undefined), null);
  });

  it('should return null for non-string input', () => {
    assert.equal(parseViewport(123), null);
  });

  it('should return null for invalid format', () => {
    assert.equal(parseViewport('invalid'), null);
    assert.equal(parseViewport('mobile:375'), null);
    assert.equal(parseViewport('mobile:375x'), null);
    assert.equal(parseViewport(':375x667'), null);
  });
});

describe('formatViewport', () => {
  it('should format valid viewport object', () => {
    let result = formatViewport({ name: 'mobile', width: 375, height: 667 });

    assert.equal(result, 'mobile:375x667');
  });

  it('should return empty string for null', () => {
    assert.equal(formatViewport(null), '');
  });

  it('should return empty string for undefined', () => {
    assert.equal(formatViewport(undefined), '');
  });

  it('should return empty string for missing name', () => {
    assert.equal(formatViewport({ width: 375, height: 667 }), '');
  });

  it('should return empty string for missing width', () => {
    assert.equal(formatViewport({ name: 'mobile', height: 667 }), '');
  });

  it('should return empty string for missing height', () => {
    assert.equal(formatViewport({ name: 'mobile', width: 375 }), '');
  });
});

describe('setViewport', () => {
  it('should call page.setViewportSize with correct dimensions', async () => {
    let mockSetViewportSize = mock.fn();
    let mockPage = { setViewportSize: mockSetViewportSize };
    let viewport = { width: 375, height: 667 };

    await setViewport(mockPage, viewport);

    assert.equal(mockSetViewportSize.mock.calls.length, 1);
    assert.deepEqual(mockSetViewportSize.mock.calls[0].arguments[0], {
      width: 375,
      height: 667,
    });
  });
});

describe('getCommonViewports', () => {
  it('should return array of common viewport presets', () => {
    let viewports = getCommonViewports();

    assert.ok(Array.isArray(viewports));
    assert.ok(viewports.length > 0);
  });

  it('should include mobile viewport', () => {
    let viewports = getCommonViewports();
    let mobile = viewports.find(v => v.name === 'mobile');

    assert.ok(mobile);
    assert.equal(mobile.width, 375);
    assert.equal(mobile.height, 667);
  });

  it('should include desktop viewport', () => {
    let viewports = getCommonViewports();
    let desktop = viewports.find(v => v.name === 'desktop');

    assert.ok(desktop);
    assert.equal(desktop.width, 1920);
    assert.equal(desktop.height, 1080);
  });

  it('should include tablet viewport', () => {
    let viewports = getCommonViewports();
    let tablet = viewports.find(v => v.name === 'tablet');

    assert.ok(tablet);
    assert.equal(tablet.width, 768);
    assert.equal(tablet.height, 1024);
  });

  it('should include landscape viewports', () => {
    let viewports = getCommonViewports();
    let mobileLandscape = viewports.find(v => v.name === 'mobile-landscape');
    let tabletLandscape = viewports.find(v => v.name === 'tablet-landscape');

    assert.ok(mobileLandscape);
    assert.ok(tabletLandscape);
  });
});
