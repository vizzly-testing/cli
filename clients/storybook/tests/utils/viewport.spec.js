/**
 * Tests for viewport utilities
 */

import { describe, expect, it } from 'vitest';
import {
  formatViewport,
  getCommonViewports,
  parseViewport,
} from '../../src/utils/viewport.js';

describe('parseViewport', () => {
  it('should parse valid viewport string', () => {
    let viewport = parseViewport('mobile:375x667');

    expect(viewport).toEqual({
      name: 'mobile',
      width: 375,
      height: 667,
    });
  });

  it('should parse viewport with spaces', () => {
    let viewport = parseViewport('  desktop : 1920 x 1080  ');

    expect(viewport).toEqual({
      name: 'desktop',
      width: 1920,
      height: 1080,
    });
  });

  it('should return null for invalid format', () => {
    expect(parseViewport('invalid')).toBeNull();
    expect(parseViewport('mobile-375x667')).toBeNull();
    expect(parseViewport('mobile:375')).toBeNull();
  });

  it('should return null for non-string input', () => {
    expect(parseViewport(null)).toBeNull();
    expect(parseViewport(undefined)).toBeNull();
    expect(parseViewport(123)).toBeNull();
  });
});

describe('formatViewport', () => {
  it('should format viewport object', () => {
    let formatted = formatViewport({
      name: 'mobile',
      width: 375,
      height: 667,
    });

    expect(formatted).toBe('mobile:375x667');
  });

  it('should return empty string for invalid input', () => {
    expect(formatViewport(null)).toBe('');
    expect(formatViewport({})).toBe('');
    expect(formatViewport({ name: 'test' })).toBe('');
  });
});

describe('getCommonViewports', () => {
  it('should return array of common viewports', () => {
    let viewports = getCommonViewports();

    expect(viewports).toBeInstanceOf(Array);
    expect(viewports.length).toBeGreaterThan(0);
    expect(viewports[0]).toHaveProperty('name');
    expect(viewports[0]).toHaveProperty('width');
    expect(viewports[0]).toHaveProperty('height');
  });
});
