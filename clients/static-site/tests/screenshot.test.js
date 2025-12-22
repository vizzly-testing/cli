/**
 * Tests for screenshot functions
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  generateScreenshotName,
  generateScreenshotProperties,
} from '../src/screenshot.js';

describe('generateScreenshotName', () => {
  it('generates name from page path', () => {
    let page = { path: '/about' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'about');
  });

  it('handles root path', () => {
    let page = { path: '/' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'index');
  });

  it('replaces slashes with hyphens', () => {
    let page = { path: '/blog/post-1' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'blog-post-1');
    assert.ok(!name.includes('/'));
  });

  it('handles nested paths', () => {
    let page = { path: '/configuration/billing' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'configuration-billing');
  });

  it('handles deeply nested paths', () => {
    let page = { path: '/api/v1/users/settings' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'api-v1-users-settings');
  });

  it('handles paths without leading slash', () => {
    let page = { path: 'docs/guide' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'docs-guide');
  });

  it('handles empty path', () => {
    let page = { path: '' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'index');
  });

  it('handles backslashes', () => {
    let page = { path: 'foo\\bar' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'foo-bar');
    assert.ok(!name.includes('\\'));
  });

  it('handles path traversal attempts', () => {
    let testCases = [
      { path: '../../etc/passwd', expected: '.-.-etc-passwd' },
      { path: '../../../sensitive', expected: '.-.-.-sensitive' },
      { path: '/path/../secret', expected: 'path-.-secret' },
    ];

    for (let testCase of testCases) {
      let page = { path: testCase.path };
      let name = generateScreenshotName(page);
      assert.strictEqual(name, testCase.expected);
      // Ensure no path traversal sequences remain
      assert.ok(!name.includes('..'));
      // Ensure no unescaped slashes remain
      assert.ok(!name.includes('/'));
      assert.ok(!name.includes('\\'));
    }
  });

  it('handles triple dots', () => {
    let page = { path: '/normal/.../path' };
    let name = generateScreenshotName(page);
    // Triple dots contain .., which gets replaced: ... -> .
    assert.strictEqual(name, 'normal-..-path');
    assert.ok(!name.includes('...'));
  });

  it('handles trailing slashes', () => {
    let page = { path: '/about/' };
    let name = generateScreenshotName(page);
    assert.strictEqual(name, 'about-');
  });
});

describe('generateScreenshotProperties', () => {
  it('generates properties with viewport info', () => {
    let viewport = { name: 'mobile', width: 375, height: 667 };
    let properties = generateScreenshotProperties(viewport);

    assert.deepStrictEqual(properties, {
      viewport: 'mobile',
      viewportWidth: 375,
      viewportHeight: 667,
    });
  });

  it('includes viewport dimensions', () => {
    let viewport1 = { name: 'mobile', width: 375, height: 667 };
    let viewport2 = { name: 'desktop', width: 1920, height: 1080 };
    let viewport3 = { name: 'tablet', width: 768, height: 1024 };

    let props1 = generateScreenshotProperties(viewport1);
    let props2 = generateScreenshotProperties(viewport2);
    let props3 = generateScreenshotProperties(viewport3);

    assert.strictEqual(props1.viewportWidth, 375);
    assert.strictEqual(props1.viewportHeight, 667);

    assert.strictEqual(props2.viewportWidth, 1920);
    assert.strictEqual(props2.viewportHeight, 1080);

    assert.strictEqual(props3.viewportWidth, 768);
    assert.strictEqual(props3.viewportHeight, 1024);
  });

  it('handles different viewport names', () => {
    let viewport1 = { name: 'mobile', width: 375, height: 667 };
    let viewport2 = { name: 'desktop', width: 1920, height: 1080 };

    assert.strictEqual(
      generateScreenshotProperties(viewport1).viewport,
      'mobile'
    );
    assert.strictEqual(
      generateScreenshotProperties(viewport2).viewport,
      'desktop'
    );
  });
});
