/**
 * Tests for screenshot functions
 */

import { describe, it, expect } from 'vitest';
import { generateScreenshotName } from '../src/screenshot.js';

describe('generateScreenshotName', () => {
  it('should generate correct screenshot name', () => {
    let page = { path: '/about' };
    let viewport = { name: 'mobile' };

    let name = generateScreenshotName(page, viewport);

    expect(name).toBe('about@mobile');
  });

  it('should handle root path', () => {
    let page = { path: '/' };
    let viewport = { name: 'desktop' };

    let name = generateScreenshotName(page, viewport);

    expect(name).toBe('index@desktop');
  });

  it('should handle nested paths', () => {
    let page = { path: '/blog/post-1' };
    let viewport = { name: 'tablet' };

    let name = generateScreenshotName(page, viewport);

    expect(name).toBe('blog/post-1@tablet');
  });

  it('should handle paths without leading slash', () => {
    let page = { path: 'docs/guide' };
    let viewport = { name: 'mobile' };

    let name = generateScreenshotName(page, viewport);

    expect(name).toBe('docs/guide@mobile');
  });

  it('should handle empty path', () => {
    let page = { path: '' };
    let viewport = { name: 'desktop' };

    let name = generateScreenshotName(page, viewport);

    expect(name).toBe('index@desktop');
  });

  it('should handle different viewport names', () => {
    let page = { path: '/pricing' };
    let viewport1 = { name: 'mobile' };
    let viewport2 = { name: 'desktop' };
    let viewport3 = { name: 'tablet' };

    expect(generateScreenshotName(page, viewport1)).toBe('pricing@mobile');
    expect(generateScreenshotName(page, viewport2)).toBe('pricing@desktop');
    expect(generateScreenshotName(page, viewport3)).toBe('pricing@tablet');
  });
});
