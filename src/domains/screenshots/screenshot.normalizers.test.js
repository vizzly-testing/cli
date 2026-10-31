import assert from 'node:assert';
import { describe, it } from 'node:test';
import { extractProperties } from './screenshot.normalizers.js';

describe('extractProperties', () => {
  it('returns empty object for null/undefined', () => {
    assert.deepStrictEqual(extractProperties(null), {});
    assert.deepStrictEqual(extractProperties(undefined), {});
  });

  it('uses dimensions from the captured image', () => {
    let props = {
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 },
    };

    let result = extractProperties(props, { width: 800, height: 600 });

    assert.strictEqual(result.viewport_width, 800);
    assert.strictEqual(result.viewport_height, 600);
    assert.strictEqual(result.browser, 'chrome');
    assert.deepStrictEqual(result.metadata.viewport, {
      width: 1920,
      height: 1080,
    });
  });

  it('does not treat user dimension properties as image dimensions', () => {
    let props = {
      viewport_width: 1280,
      viewport_height: 720,
    };

    let result = extractProperties(props);

    assert.strictEqual(result.viewport_width, null);
    assert.strictEqual(result.viewport_height, null);
    assert.strictEqual(result.metadata.viewport_width, 1280);
    assert.strictEqual(result.metadata.viewport_height, 720);
  });

  it('sets null for missing values', () => {
    let result = extractProperties({});

    assert.strictEqual(result.viewport_width, null);
    assert.strictEqual(result.viewport_height, null);
    assert.strictEqual(result.browser, null);
  });

  it('preserves metadata field', () => {
    let props = { browser: 'safari' };
    let result = extractProperties(props);

    assert.deepStrictEqual(result.metadata, props);
  });
});
