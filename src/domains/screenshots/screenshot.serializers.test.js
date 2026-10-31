import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildScreenshotCheckObject,
  buildScreenshotPayload,
  buildScreenshotResolvePayload,
  buildShaCheckPayload,
} from './screenshot.serializers.js';

describe('buildScreenshotPayload', () => {
  it('builds payload with name, base64 image, and metadata', () => {
    let buffer = Buffer.from('fake-image-data');
    let result = buildScreenshotPayload('homepage', buffer, {
      browser: 'firefox',
    });

    assert.strictEqual(result.name, 'homepage');
    assert.strictEqual(result.image_data, buffer.toString('base64'));
    assert.deepStrictEqual(result.properties, { browser: 'firefox' });
    assert.strictEqual(result.sha256, undefined);
  });

  it('includes sha256 when provided', () => {
    let buffer = Buffer.from('image');
    let result = buildScreenshotPayload('test', buffer, {}, 'abc123');

    assert.strictEqual(result.sha256, 'abc123');
  });

  it('sends operational options outside the user metadata bag', () => {
    let result = buildScreenshotPayload(
      'homepage',
      Buffer.from('image'),
      { theme: 'dark' },
      null,
      {
        threshold: 0.1,
        minClusterSize: 4,
        fullPage: true,
        captureMode: 'full_page',
        deviceScaleFactor: 2,
        selector: '#app',
      }
    );

    assert.deepStrictEqual(result.properties, { theme: 'dark' });
    assert.strictEqual(result.threshold, 0.1);
    assert.strictEqual(result.minClusterSize, 4);
    assert.strictEqual(result.fullPage, true);
    assert.strictEqual(result.captureMode, 'full_page');
    assert.strictEqual(result.deviceScaleFactor, 2);
    assert.strictEqual(result.selector, '#app');
  });

  it('defaults metadata to empty object', () => {
    let buffer = Buffer.from('image');
    let result = buildScreenshotPayload('test', buffer);

    assert.deepStrictEqual(result.properties, {});
  });

  it('handles null metadata', () => {
    let buffer = Buffer.from('image');
    let result = buildScreenshotPayload('test', buffer, null);

    assert.deepStrictEqual(result.properties, {});
  });

  it('builds SHA resolve payload without image bytes', () => {
    let result = buildScreenshotResolvePayload(
      'homepage',
      { browser: 'firefox' },
      'abc123'
    );

    assert.deepStrictEqual(result, {
      name: 'homepage',
      properties: { browser: 'firefox' },
      sha256: 'abc123',
    });
    assert.strictEqual(result.image_data, undefined);
  });
});

describe('buildShaCheckPayload', () => {
  it('builds signature-based payload for object screenshots', () => {
    let screenshots = [{ sha256: 'abc', name: 'test', browser: 'chrome' }];
    let result = buildShaCheckPayload(screenshots, 'build-123');

    assert.deepStrictEqual(result, {
      buildId: 'build-123',
      screenshots,
    });
  });

  it('builds legacy payload for string SHA array', () => {
    let shas = ['abc', 'def'];
    let result = buildShaCheckPayload(shas, 'build-123');

    assert.deepStrictEqual(result, {
      shas: ['abc', 'def'],
      buildId: 'build-123',
    });
  });

  it('handles empty array', () => {
    let result = buildShaCheckPayload([], 'build-123');

    assert.deepStrictEqual(result, {
      shas: [],
      buildId: 'build-123',
    });
  });
});

describe('buildScreenshotCheckObject', () => {
  it('does not invent browser or image dimensions', () => {
    let result = buildScreenshotCheckObject('sha123', 'homepage');

    assert.deepStrictEqual(result, {
      sha256: 'sha123',
      name: 'homepage',
      properties: {},
    });
  });

  it('keeps metadata inside properties', () => {
    let result = buildScreenshotCheckObject('sha123', 'homepage', {
      browser: 'firefox',
      viewport: { width: 1280, height: 720 },
    });

    assert.deepStrictEqual(result.properties, {
      browser: 'firefox',
      viewport: { width: 1280, height: 720 },
    });
  });

  it('does not promote dimension-shaped properties', () => {
    let result = buildScreenshotCheckObject('sha123', 'homepage', {
      viewport_width: 800,
      viewport_height: 600,
    });

    assert.deepStrictEqual(result.properties, {
      viewport_width: 800,
      viewport_height: 600,
    });
  });

  it('handles null metadata', () => {
    let result = buildScreenshotCheckObject('sha123', 'homepage', null);

    assert.deepStrictEqual(result.properties, {});
  });
});
