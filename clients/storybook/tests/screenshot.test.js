/**
 * Tests for screenshot functions
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  captureAndSendScreenshot,
  captureScreenshot,
  generateScreenshotName,
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
      fullPage: false,
      omitBackground: false,
      timeout: 45000,
    });
  });

  it('should capture full page screenshot', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };

    await captureScreenshot(mockPage, { fullPage: true });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: true,
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
      fullPage: false,
      omitBackground: true,
      timeout: 45000,
    });
  });
});

describe('captureAndSendScreenshot', () => {
  it('should capture and send screenshot to vizzly', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };
    let story = { title: 'Button', name: 'Primary' };
    let viewport = { name: 'desktop' };

    // This will use the mock vizzlyScreenshot from the module
    await captureAndSendScreenshot(mockPage, story, viewport);

    assert.equal(mockScreenshot.mock.calls.length, 1);
  });

  it('should pass screenshot options through', async () => {
    let mockBuffer = Buffer.from('fake-screenshot');
    let mockScreenshot = mock.fn(() => mockBuffer);
    let mockPage = { screenshot: mockScreenshot };
    let story = { title: 'Card', name: 'Default' };
    let viewport = { name: 'mobile' };

    await captureAndSendScreenshot(mockPage, story, viewport, {
      fullPage: true,
    });

    assert.deepEqual(mockScreenshot.mock.calls[0].arguments[0], {
      fullPage: true,
      omitBackground: false,
      timeout: 45000,
    });
  });
});
