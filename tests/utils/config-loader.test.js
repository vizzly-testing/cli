import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getScreenshotPaths } from '../../src/utils/config-loader.js';

describe('utils/config-loader', () => {
  describe('getScreenshotPaths', () => {
    it('returns default path when not configured', () => {
      let paths = getScreenshotPaths({});

      assert.strictEqual(paths.length, 1);
      assert.ok(paths[0].includes('screenshots'));
    });

    it('returns single path from string config', () => {
      let paths = getScreenshotPaths({
        upload: { screenshotsDir: './my-screenshots' },
      });

      assert.strictEqual(paths.length, 1);
      assert.ok(paths[0].includes('my-screenshots'));
    });

    it('returns multiple paths from array config', () => {
      let paths = getScreenshotPaths({
        upload: { screenshotsDir: ['./screenshots1', './screenshots2'] },
      });

      assert.strictEqual(paths.length, 2);
      assert.ok(paths[0].includes('screenshots1'));
      assert.ok(paths[1].includes('screenshots2'));
    });

    it('resolves paths relative to cwd', () => {
      let paths = getScreenshotPaths({
        upload: { screenshotsDir: './relative' },
      });

      assert.ok(paths[0].startsWith(process.cwd()));
    });
  });
});
