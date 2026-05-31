import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getDefaultChromiumArgs } from '../../src/launcher/browser.js';

let originalCi = process.env.CI;

afterEach(() => {
  if (originalCi === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = originalCi;
  }
});

describe('launcher/browser', () => {
  describe('getDefaultChromiumArgs', () => {
    it('keeps CI Chromium flags to sandbox and shared-memory stability args', () => {
      process.env.CI = 'true';

      let args = getDefaultChromiumArgs();

      assert.ok(args.includes('--no-sandbox'));
      assert.ok(args.includes('--disable-setuid-sandbox'));
      assert.ok(args.includes('--disable-dev-shm-usage'));
      assert.ok(args.includes('--disable-extensions'));
      assert.equal(args.includes('--disable-gpu'), false);
      assert.equal(args.includes('--disable-software-rasterizer'), false);
    });
  });
});
