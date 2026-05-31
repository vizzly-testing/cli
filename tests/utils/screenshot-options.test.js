import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createScreenshotProperties,
  normalizeScreenshotOptions,
} from '../../src/utils/screenshot-options.js';

describe('createScreenshotProperties', () => {
  it('normalizes comparison options into the server properties payload', () => {
    let properties = createScreenshotProperties({
      buildId: 'build-1',
      browser: 'chromium',
      properties: { url: '/checkout' },
      threshold: 0,
      minClusterSize: 3,
      fullPage: true,
    });

    assert.deepStrictEqual(properties, {
      url: '/checkout',
      threshold: 0,
      minClusterSize: 3,
      fullPage: true,
    });
  });

  it('lets dedicated comparison options override nested properties', () => {
    let normalized = normalizeScreenshotOptions({
      threshold: 1,
      minClusterSize: 2,
      properties: {
        threshold: 5,
        minClusterSize: 10,
      },
    });

    assert.deepStrictEqual(normalized.properties, {
      threshold: 1,
      minClusterSize: 2,
    });
    assert.deepStrictEqual(
      normalized.warnings.map(warning => warning.option),
      ['threshold', 'minClusterSize']
    );
  });

  it('promotes reserved property options when top-level options are absent', () => {
    let normalized = normalizeScreenshotOptions({
      properties: {
        theme: 'dark',
        threshold: 0.2,
        minClusterSize: 5,
        fullPage: true,
        buildId: 'build-from-properties',
        requestTimeout: 60_000,
      },
    });

    assert.deepStrictEqual(normalized.properties, {
      theme: 'dark',
      threshold: 0.2,
      minClusterSize: 5,
      fullPage: true,
    });
    assert.strictEqual(normalized.buildId, 'build-from-properties');
    assert.strictEqual(normalized.requestTimeout, 60_000);
    assert.deepStrictEqual(
      normalized.warnings.map(warning => warning.option),
      [
        'threshold',
        'minClusterSize',
        'fullPage',
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
