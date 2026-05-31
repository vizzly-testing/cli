import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createScreenshotProperties } from '../../src/utils/screenshot-options.js';

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
      browser: 'chromium',
      url: '/checkout',
      threshold: 0,
      minClusterSize: 3,
      fullPage: true,
    });
  });

  it('lets dedicated comparison options override nested properties', () => {
    let properties = createScreenshotProperties({
      threshold: 1,
      minClusterSize: 2,
      properties: {
        threshold: 5,
        minClusterSize: 10,
      },
    });

    assert.deepStrictEqual(properties, {
      threshold: 1,
      minClusterSize: 2,
    });
  });

  it('lets explicit top-level metadata override nested properties', () => {
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
      browser: 'chromium',
      url: 'http://localhost:3000/current',
      viewport: { width: 1440, height: 900 },
      theme: 'dark',
    });
  });
});
