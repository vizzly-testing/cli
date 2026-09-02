import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createScreenshotProperties,
  normalizeScreenshotOptions,
} from '../../src/utils/screenshot-options.js';

describe('createScreenshotProperties', () => {
  it('keeps comparison options out of the server properties payload', () => {
    let normalized = normalizeScreenshotOptions({
      buildId: 'build-1',
      browser: 'chromium',
      properties: { url: '/checkout' },
      threshold: 0,
      minClusterSize: 3,
      fullPage: true,
    });

    assert.deepStrictEqual(normalized.properties, { url: '/checkout' });
    assert.strictEqual(normalized.threshold, 0);
    assert.strictEqual(normalized.minClusterSize, 3);
    assert.strictEqual(normalized.fullPage, true);
  });

  it('does not interpret reserved property names as options', () => {
    let normalized = normalizeScreenshotOptions({
      threshold: 1,
      minClusterSize: 2,
      properties: {
        threshold: 5,
        minClusterSize: 10,
      },
    });

    assert.deepStrictEqual(normalized.properties, {});
    assert.strictEqual(normalized.threshold, 1);
    assert.strictEqual(normalized.minClusterSize, 2);
    assert.deepStrictEqual(
      normalized.warnings.map(warning => warning.option),
      ['threshold', 'minClusterSize']
    );
  });

  it('does not promote reserved properties into top-level options', () => {
    let normalized = normalizeScreenshotOptions({
      properties: {
        theme: 'dark',
        threshold: 0.2,
        minClusterSize: 5,
        fullPage: true,
        dpr: 2,
        buildId: 'build-from-properties',
        requestTimeout: 60_000,
      },
    });

    assert.deepStrictEqual(normalized.properties, { theme: 'dark' });
    assert.strictEqual(normalized.threshold, undefined);
    assert.strictEqual(normalized.minClusterSize, undefined);
    assert.strictEqual(normalized.fullPage, undefined);
    assert.strictEqual(normalized.buildId, undefined);
    assert.strictEqual(normalized.requestTimeout, undefined);
    assert.deepStrictEqual(
      normalized.warnings.map(warning => warning.option),
      [
        'threshold',
        'minClusterSize',
        'fullPage',
        'dpr',
        'buildId',
        'requestTimeout',
      ]
    );
  });

  it('ignores arbitrary top-level metadata outside the user properties bag', () => {
    let properties = createScreenshotProperties({
      browser: 'chromium',
      url: 'http://localhost:3000/current',
      viewport: { width: 1440, height: 900 },
      properties: {
        browser: 'firefox',
        url: 'http://stale.example',
        viewport: { width: 375, height: 667 },
        theme: 'dark',
      },
    });

    assert.deepStrictEqual(properties, {
      browser: 'firefox',
      url: 'http://stale.example',
      viewport: { width: 375, height: 667 },
      theme: 'dark',
    });
  });
});
