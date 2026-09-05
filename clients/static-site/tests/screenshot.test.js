/**
 * Tests for screenshot functions
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { buildScreenshotCheckObject } from '../../../src/api/core.js';
import {
  captureAndSendScreenshot,
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
  it('generates browser, URL, and user properties without capture dimensions', () => {
    let viewport = { name: 'mobile', width: 375, height: 667 };
    let properties = generateScreenshotProperties(viewport, {
      browser: 'firefox',
      fullPage: false,
      url: 'http://localhost:3000/mobile',
      properties: { page: 'homepage' },
    });

    assert.deepStrictEqual(properties, {
      browser: 'firefox',
      url: 'http://localhost:3000/mobile',
      page: 'homepage',
    });
  });

  it('includes browser metadata when provided', () => {
    let viewport = { name: 'desktop', width: 1920, height: 1080 };
    let properties = generateScreenshotProperties(viewport, {
      browser: 'firefox',
    });

    assert.strictEqual(properties.browser, 'firefox');
  });

  it('does not include capture options in user properties', () => {
    let viewport = { name: 'desktop', width: 1920, height: 1080 };
    let properties = generateScreenshotProperties(viewport, {
      fullPage: false,
    });

    assert.strictEqual(properties.fullPage, undefined);
  });

  it('does not add dimensions to cloud SHA checks', () => {
    let properties = generateScreenshotProperties({
      name: 'mobile',
      width: 375,
      height: 667,
    });

    let check = buildScreenshotCheckObject('sha-123', 'index', properties);

    assert.deepStrictEqual(check, {
      sha256: 'sha-123',
      name: 'index',
      properties: {},
    });
  });

  it('does not serialize viewport names or dimensions', () => {
    let properties = generateScreenshotProperties({
      name: 'mobile',
      width: 375,
      height: 667,
    });

    assert.deepStrictEqual(properties, {});
  });
});

describe('captureAndSendScreenshot', () => {
  it('sends the screenshot metadata users configure for static-site captures', async () => {
    let screenshot = Buffer.from('fake-screenshot');
    let mockVizzlyScreenshot = mock.fn(async () => {});
    let page = {
      screenshot: mock.fn(async () => screenshot),
      url: () => 'http://localhost:3000/docs',
    };

    await captureAndSendScreenshot(
      page,
      { path: '/docs' },
      { name: 'desktop', width: 1920, height: 1080 },
      {
        browser: 'chromium',
        fullPage: false,
        requestTimeout: 120000,
        properties: { page: 'docs', test: 'static-site' },
      },
      { vizzlyScreenshot: mockVizzlyScreenshot }
    );

    assert.strictEqual(mockVizzlyScreenshot.mock.callCount(), 1);
    let [name, image, options] = mockVizzlyScreenshot.mock.calls[0].arguments;

    assert.strictEqual(name, 'docs');
    assert.strictEqual(image, screenshot);
    assert.deepStrictEqual(options, {
      properties: {
        browser: 'chromium',
        url: 'http://localhost:3000/docs',
        page: 'docs',
        test: 'static-site',
      },
      fullPage: false,
      requestTimeout: 120000,
    });
  });

  it('does not turn screenshot timeout into Vizzly request timeout', async () => {
    let screenshot = Buffer.from('fake-screenshot');
    let mockVizzlyScreenshot = mock.fn(async () => {});
    let page = {
      screenshot: mock.fn(async () => screenshot),
      url: () => 'http://localhost:3000/docs',
    };

    await captureAndSendScreenshot(
      page,
      { path: '/docs' },
      { name: 'desktop', width: 1920, height: 1080 },
      {
        browser: 'chromium',
        fullPage: true,
        timeout: 45_000,
      },
      { vizzlyScreenshot: mockVizzlyScreenshot }
    );

    let [, , options] = mockVizzlyScreenshot.mock.calls[0].arguments;

    assert.strictEqual(options.requestTimeout, undefined);
    assert.strictEqual(options.properties.requestTimeout, undefined);
  });
});
