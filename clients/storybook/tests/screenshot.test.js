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

    assert.strictEqual(name, 'Button-Primary@mobile');
  });

  it('should handle complex component names', () => {
    let story = { title: 'Components/Atoms/Button', name: 'WithIcon' };
    let viewport = { name: 'desktop' };

    let name = generateScreenshotName(story, viewport);

    assert.strictEqual(name, 'Components-Atoms-Button-WithIcon@desktop');
  });

  it('should handle special characters', () => {
    let story = { title: 'Form/Input Field', name: 'With Label & Error' };
    let viewport = { name: 'tablet' };

    let name = generateScreenshotName(story, viewport);

    assert.strictEqual(name, 'Form-Input Field-With Label & Error@tablet');
  });
});

describe('captureScreenshot', () => {
  it('should call page.screenshot with default options', async () => {
    let buffer = Buffer.from('test');
    let page = {
      screenshot: mock.fn(async options => {
        assert.deepEqual(options, { fullPage: false, omitBackground: false });
        return buffer;
      }),
    };

    let result = await captureScreenshot(page);

    assert.strictEqual(result, buffer);
    assert.strictEqual(page.screenshot.mock.calls.length, 1);
  });

  it('should pass provided screenshot options through', async () => {
    let buffer = Buffer.from('test');
    let page = {
      screenshot: mock.fn(async options => {
        assert.deepEqual(options, { fullPage: true, omitBackground: true });
        return buffer;
      }),
    };

    let result = await captureScreenshot(page, {
      fullPage: true,
      omitBackground: true,
    });

    assert.strictEqual(result, buffer);
    assert.strictEqual(page.screenshot.mock.calls.length, 1);
  });
});

describe('captureAndSendScreenshot', () => {
  it('should capture and send screenshot with generated name', async () => {
    let screenshotBuffer = Buffer.from('image-bytes');
    let page = {
      screenshot: mock.fn(async () => screenshotBuffer),
    };
    let sendScreenshot = mock.fn(async () => {});

    let story = { title: 'Components/Button', name: 'Primary' };
    let viewport = { name: 'desktop' };

    await captureAndSendScreenshot(
      page,
      story,
      viewport,
      { fullPage: true },
      sendScreenshot
    );

    assert.strictEqual(page.screenshot.mock.calls.length, 1);
    assert.deepEqual(page.screenshot.mock.calls[0].arguments[0], {
      fullPage: true,
      omitBackground: false,
    });

    assert.strictEqual(sendScreenshot.mock.calls.length, 1);
    assert.strictEqual(
      sendScreenshot.mock.calls[0].arguments[0],
      'Components-Button-Primary@desktop'
    );
    assert.strictEqual(sendScreenshot.mock.calls[0].arguments[1], screenshotBuffer);
  });

  it('should no-op if sendScreenshot is null', async () => {
    let screenshotBuffer = Buffer.from('image-bytes');
    let page = {
      screenshot: mock.fn(async () => screenshotBuffer),
    };

    let story = { title: 'Button', name: 'Primary' };
    let viewport = { name: 'desktop' };

    await captureAndSendScreenshot(page, story, viewport, {}, null);

    assert.strictEqual(page.screenshot.mock.calls.length, 1);
  });
});
