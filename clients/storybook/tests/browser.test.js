/**
 * Tests for browser launching and management
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { launchBrowser } from '../src/browser.js';

function createBrowserTypes(overrides = {}) {
  let calls = [];
  let browser = { id: 'browser' };

  function createBrowserType(name) {
    return {
      async launch(options) {
        calls.push({ name, options });
        return browser;
      },
    };
  }

  return {
    browser,
    calls,
    browsers: {
      chromium: createBrowserType('chromium'),
      firefox: createBrowserType('firefox'),
      webkit: createBrowserType('webkit'),
      ...overrides,
    },
  };
}

function createMissingBrowserType(message) {
  return {
    async launch() {
      throw new Error(message);
    },
  };
}

describe('browser', () => {
  describe('launchBrowser', () => {
    it('throws error for invalid browser type', async () => {
      await assert.rejects(
        () => launchBrowser({ type: 'invalid-browser' }, createBrowserTypes()),
        {
          message: /Unknown browser type: invalid-browser/,
        }
      );
    });

    it('defaults to chromium when no type specified', async () => {
      let dependencies = createBrowserTypes();

      let browser = await launchBrowser(
        { type: undefined, headless: false },
        dependencies
      );

      assert.strictEqual(browser, dependencies.browser);
      assert.strictEqual(dependencies.calls[0].name, 'chromium');
      assert.strictEqual(dependencies.calls[0].options.headless, false);
    });

    it('chromium args include sandbox and memory flags', async () => {
      let dependencies = createBrowserTypes();

      await launchBrowser(
        { type: 'chromium', args: ['--custom-flag'] },
        dependencies
      );

      let launchArgs = dependencies.calls[0].options.args;
      assert.ok(launchArgs.includes('--no-sandbox'));
      assert.ok(launchArgs.includes('--disable-dev-shm-usage'));
      assert.ok(launchArgs.includes('--custom-flag'));
    });

    it('passes non-chromium browser args through unchanged', async () => {
      let dependencies = createBrowserTypes();

      await launchBrowser(
        { type: 'firefox', args: ['--custom-flag'] },
        dependencies
      );

      assert.deepStrictEqual(dependencies.calls[0].options.args, [
        '--custom-flag',
      ]);
    });

    it('rewrites browser-not-installed errors with install guidance', async () => {
      let dependencies = createBrowserTypes({
        firefox: createMissingBrowserType('playwright install'),
      });

      await assert.rejects(
        () => launchBrowser({ type: 'firefox' }, dependencies),
        {
          message: /pnpm exec playwright install firefox/,
        }
      );
    });

    it('does not rewrite generic browserType launch failures', async () => {
      let dependencies = createBrowserTypes({
        chromium: createMissingBrowserType(
          'browserType.launch: Target page, context or browser has been closed'
        ),
      });

      await assert.rejects(
        () => launchBrowser({ type: 'chromium' }, dependencies),
        {
          message: /Target page, context or browser has been closed/,
        }
      );
    });
  });
});
