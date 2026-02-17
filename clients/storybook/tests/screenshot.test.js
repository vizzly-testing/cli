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
  toStoryUrl,
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
    let viewport = { name: 'desktop' };

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
});

describe('toStoryUrl', () => {
  it('should convert iframe.html URL to story path URL', () => {
    let url = toStoryUrl(
      'http://localhost:6006/iframe.html?id=button--primary&viewMode=story',
      'button--primary'
    );
    assert.equal(url, 'http://localhost:6006/?path=/story/button--primary');
  });

  it('should encode special characters in story ID', () => {
    let url = toStoryUrl(
      'http://localhost:6006/iframe.html?id=components%2Fbutton--primary&viewMode=story',
      'components/button--primary'
    );
    assert.equal(
      url,
      'http://localhost:6006/?path=/story/components%2Fbutton--primary'
    );
  });

  it('should preserve non-default ports', () => {
    let url = toStoryUrl(
      'http://localhost:9009/iframe.html?id=card--default&viewMode=story',
      'card--default'
    );
    assert.equal(url, 'http://localhost:9009/?path=/story/card--default');
  });

  it('should fall back to raw URL on invalid input', () => {
    let url = toStoryUrl('not-a-url', 'button--primary');
    assert.equal(url, 'not-a-url');
  });
});

describe('captureAndSendScreenshot', () => {
  it('should send the converted story URL to vizzly', async () => {
    let mockVizzly = mock.fn(async () => {});
    _setVizzlyScreenshot(mockVizzly);

    let mockBuffer = Buffer.from('fake-screenshot');
    let mockPage = {
      screenshot: mock.fn(() => mockBuffer),
      url: () => 'http://localhost:6006/iframe.html?id=button--primary&viewMode=story',
    };
    let story = { id: 'button--primary', title: 'Button', name: 'Primary' };
    let viewport = { name: 'desktop' };

    await captureAndSendScreenshot(mockPage, story, viewport);

    assert.equal(mockVizzly.mock.calls.length, 1);
    let [name, , options] = mockVizzly.mock.calls[0].arguments;
    assert.equal(name, 'Button-Primary@desktop');
    assert.equal(
      options.properties.url,
      'http://localhost:6006/?path=/story/button--primary'
    );
  });

  it('should pass screenshot options through', async () => {
    let mockVizzly = mock.fn(async () => {});
    _setVizzlyScreenshot(mockVizzly);

    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = {
      screenshot: mockScreenshot,
      url: () => 'http://localhost:6006/iframe.html?id=card--default&viewMode=story',
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
});
