/**
 * Tests for screenshot functions
 */

import { describe, it, expect } from 'vitest';
import {
  generateScreenshotName,
  generateScreenshotProperties,
} from '../src/screenshot.js';

describe('generateScreenshotName', () => {
  it('should generate name from page path', () => {
    let page = { path: '/about' };
    let name = generateScreenshotName(page);
    expect(name).toBe('about');
  });

  it('should handle root path', () => {
    let page = { path: '/' };
    let name = generateScreenshotName(page);
    expect(name).toBe('index');
  });

  it('should replace slashes with hyphens', () => {
    let page = { path: '/blog/post-1' };
    let name = generateScreenshotName(page);
    expect(name).toBe('blog-post-1');
    expect(name).not.toContain('/');
  });

  it('should handle nested paths', () => {
    let page = { path: '/configuration/billing' };
    let name = generateScreenshotName(page);
    expect(name).toBe('configuration-billing');
  });

  it('should handle deeply nested paths', () => {
    let page = { path: '/api/v1/users/settings' };
    let name = generateScreenshotName(page);
    expect(name).toBe('api-v1-users-settings');
  });

  it('should handle paths without leading slash', () => {
    let page = { path: 'docs/guide' };
    let name = generateScreenshotName(page);
    expect(name).toBe('docs-guide');
  });

  it('should handle empty path', () => {
    let page = { path: '' };
    let name = generateScreenshotName(page);
    expect(name).toBe('index');
  });
});

describe('generateScreenshotProperties', () => {
  it('should generate properties with viewport info', () => {
    let viewport = { name: 'mobile', width: 375, height: 667 };
    let properties = generateScreenshotProperties(viewport);

    expect(properties).toEqual({
      viewport: 'mobile',
      viewportWidth: 375,
      viewportHeight: 667,
    });
  });

  it('should include viewport dimensions', () => {
    let viewport1 = { name: 'mobile', width: 375, height: 667 };
    let viewport2 = { name: 'desktop', width: 1920, height: 1080 };
    let viewport3 = { name: 'tablet', width: 768, height: 1024 };

    let props1 = generateScreenshotProperties(viewport1);
    let props2 = generateScreenshotProperties(viewport2);
    let props3 = generateScreenshotProperties(viewport3);

    expect(props1.viewportWidth).toBe(375);
    expect(props1.viewportHeight).toBe(667);

    expect(props2.viewportWidth).toBe(1920);
    expect(props2.viewportHeight).toBe(1080);

    expect(props3.viewportWidth).toBe(768);
    expect(props3.viewportHeight).toBe(1024);
  });

  it('should handle different viewport names', () => {
    let viewport1 = { name: 'mobile', width: 375, height: 667 };
    let viewport2 = { name: 'desktop', width: 1920, height: 1080 };

    expect(generateScreenshotProperties(viewport1).viewport).toBe('mobile');
    expect(generateScreenshotProperties(viewport2).viewport).toBe('desktop');
  });
});
