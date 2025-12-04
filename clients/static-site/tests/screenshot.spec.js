/**
 * Tests for screenshot functions
 */

import { describe, expect, it } from 'vitest';
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

  it('should handle backslashes', () => {
    let page = { path: 'foo\\bar' };
    let name = generateScreenshotName(page);
    expect(name).toBe('foo-bar');
    expect(name).not.toContain('\\');
  });

  it('should handle path traversal attempts', () => {
    let testCases = [
      { path: '../../etc/passwd', expected: '.-.-etc-passwd' }, // .. becomes .
      { path: '../../../sensitive', expected: '.-.-.-sensitive' }, // .. becomes ., extra / becomes -
      { path: '/path/../secret', expected: 'path-.-secret' }, // .. becomes .
    ];

    for (let testCase of testCases) {
      let page = { path: testCase.path };
      let name = generateScreenshotName(page);
      expect(name).toBe(testCase.expected);
      // Ensure no path traversal sequences remain
      expect(name).not.toContain('..');
      // Ensure no unescaped slashes remain
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
    }
  });

  it('should handle triple dots', () => {
    let page = { path: '/normal/.../path' };
    let name = generateScreenshotName(page);
    // Triple dots contain .., which gets replaced: ... -> .
    expect(name).toBe('normal-..-path');
    expect(name).not.toContain('...');
  });

  it('should handle trailing slashes', () => {
    let page = { path: '/about/' };
    let name = generateScreenshotName(page);
    expect(name).toBe('about-');
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
