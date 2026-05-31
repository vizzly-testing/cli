/**
 * Tests for screenshot functions
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  _setVizzlyScreenshot,
  captureAndSendScreenshot,
  captureScreenshot,
  generateScreenshotName,
  generateScreenshotProperties,
} from '../src/screenshot.js';

describe('generateScreenshotName', () => {
  it('should generate correct screenshot name', () => {
    let story = { title: 'Button', name: 'Primary' };
    let viewport = { name: 'mobile' };

    let name = generateScreenshotName(story, viewport);

    assert.equal(name, 'Button-Primary@mobile');
  });

  it('should handle complex component names', () => {
    let story = { title: 'Components/Atoms/Button', name: 'WithIcon' };
    let viewport = { name: 'desktop', width: 1920, height: 1080 };

    let name = generateScreenshotName(story, viewport);

    assert.equal(name, 'Components-Atoms-Button-WithIcon@desktop');
  });

  it('should handle special characters', () => {
    let story = { title: 'Form/Input Field', name: 'With Label & Error' };
    let viewport = { name: 'tablet' };

    let name = generateScreenshotName(story, viewport);

    assert.equal(name, 'Form-Input Field-With Label & Error@tablet');
  });
});

describe('generateScreenshotProperties', () => {
  it('builds cloud-compatible story and viewport metadata', () => {
    let story = { id: 'button--primary', title: 'Button', name: 'Primary' };
    let viewport = { name: 'mobile', width: 375, height: 667 };
    let properties = generateScreenshotProperties(
      story,
      viewport,
      'http://localhost:6006/iframe.html?id=button--primary',
      {
        browser: 'webkit',
        threshold: 0,
        minClusterSize: 4,
        fullPage: false,
      }
    );

    assert.deepEqual(properties, {
      storyId: 'button--primary',
      storyTitle: 'Button',
      storyName: 'Primary',
      viewport: 'mobile',
      viewport_width: 375,
      viewport_height: 667,
      url: 'http://localhost:6006/iframe.html?id=button--primary',
      browser: 'webkit',
      threshold: 0,
      minClusterSize: 4,
      fullPage: false,
    });
  });

  it('lets explicit screenshot properties override configured browser metadata', () => {
    let story = { id: 'button--primary', title: 'Button', name: 'Primary' };
    let viewport = { name: 'desktop', width: 1920, height: 1080 };
    let properties = generateScreenshotProperties(
      story,
      viewport,
      'http://localhost:6006/iframe.html?id=button--primary',
      {
        browser: 'webkit',
        properties: { browser: 'firefox' },
      }
    );

    assert.equal(properties.browser, 'firefox');
  });
});

describe('captureScreenshot', () => {
  it('should capture screenshot with default options', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };

    let result = await captureScreenshot(mockPage);

    assert.equal(result, mockBuffer);
    assert.equal(mockScreenshot.mock.calls.length, 1);
    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: true,
      omitBackground: false,
      timeout: 45000,
    });
  });

  it('should capture viewport screenshot when fullPage is false', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };

    await captureScreenshot(mockPage, { fullPage: false });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: false,
      omitBackground: false,
      timeout: 45000,
    });
  });

  it('should capture screenshot with transparent background', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };

    await captureScreenshot(mockPage, { omitBackground: true });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: true,
      omitBackground: true,
      timeout: 45000,
    });
  });

  it('uses caller-provided screenshot timeout', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };

    await captureScreenshot(mockPage, { timeout: 30_000 });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: true,
      omitBackground: false,
      timeout: 30_000,
    });
  });
});

describe('captureAndSendScreenshot', () => {
  it('should send story and viewport metadata for isolated story preview', async () => {
    let mockVizzly = mock.fn(async () => {});
    _setVizzlyScreenshot(mockVizzly);

    let mockBuffer = Buffer.from('fake-screenshot');
    let iframeUrl =
      'http://localhost:6006/iframe.html?id=button--primary&viewMode=story';
    let mockPage = {
      screenshot: mock.fn(() => mockBuffer),
      url: () => iframeUrl,
    };
    let story = { id: 'button--primary', title: 'Button', name: 'Primary' };
    let viewport = { name: 'desktop', width: 1920, height: 1080 };

    await captureAndSendScreenshot(mockPage, story, viewport);

    assert.equal(mockVizzly.mock.calls.length, 1);
    let [name, , options] = mockVizzly.mock.calls[0].arguments;
    assert.equal(name, 'Button-Primary@desktop');
    assert.deepEqual(options.properties, {
      storyId: 'button--primary',
      storyTitle: 'Button',
      storyName: 'Primary',
      viewport: 'desktop',
      viewport_width: 1920,
      viewport_height: 1080,
      url: iframeUrl,
    });
  });

  it('should pass screenshot options through', async () => {
    let mockVizzly = mock.fn(async () => {});
    _setVizzlyScreenshot(mockVizzly);

    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = {
      screenshot: mockScreenshot,
      url: () =>
        'http://localhost:6006/iframe.html?id=card--default&viewMode=story',
    };
    let story = { id: 'card--default', title: 'Card', name: 'Default' };
    let viewport = { name: 'mobile' };

    await captureAndSendScreenshot(mockPage, story, viewport, {
      fullPage: false,
    });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: false,
      omitBackground: false,
      timeout: 45000,
    });
  });

  it('passes request timeout to the Vizzly client transport', async () => {
    let mockVizzly = mock.fn(async () => {});
    _setVizzlyScreenshot(mockVizzly);

    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = {
      screenshot: mockScreenshot,
      url: () =>
        'http://localhost:6006/iframe.html?id=card--default&viewMode=story',
    };
    let story = { id: 'card--default', title: 'Card', name: 'Default' };
    let viewport = { name: 'desktop', width: 1920, height: 1080 };

    await captureAndSendScreenshot(mockPage, story, viewport, {
      timeout: 30_000,
      requestTimeout: 60_000,
    });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: true,
      omitBackground: false,
      timeout: 30_000,
    });

    let [, , options] = mockVizzly.mock.calls[0].arguments;
    assert.equal(options.requestTimeout, 60_000);
    assert.equal(options.properties.requestTimeout, undefined);
  });
});
