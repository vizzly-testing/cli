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

    it('includes supported browsers in error message', async () => {
      await assert.rejects(
        () => launchBrowser({ type: 'netscape' }, createBrowserTypes()),
        {
          message: /chromium, firefox, webkit/,
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
  });

  describe('browser-specific args', () => {
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

    it('webkit is a valid browser type', async () => {
      let dependencies = createBrowserTypes();

      await launchBrowser({ type: 'webkit' }, dependencies);

      assert.strictEqual(dependencies.calls[0].name, 'webkit');
    });
  });

  describe('error messages', () => {
    it('browser-not-installed error includes install command', async () => {
      let dependencies = createBrowserTypes({
        chromium: createMissingBrowserType("Executable doesn't exist at /tmp"),
      });

      await assert.rejects(
        () => launchBrowser({ type: 'chromium' }, dependencies),
        {
          message: /pnpm exec playwright install chromium/,
        }
      );
    });

    it('browser-not-installed error includes CI guidance', async () => {
      let dependencies = createBrowserTypes({
        firefox: createMissingBrowserType('download new browsers'),
      });

      await assert.rejects(
        () => launchBrowser({ type: 'firefox' }, dependencies),
        {
          message: /--with-deps[\s\S]*playwright\.dev\/docs\/ci/,
        }
      );
    });

    it('firefox install error suggests correct browser', async () => {
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

    it('rethrows non-install launch failures', async () => {
      let dependencies = createBrowserTypes({
        firefox: createMissingBrowserType('permission denied'),
      });

      await assert.rejects(
        () => launchBrowser({ type: 'firefox' }, dependencies),
        {
          message: /permission denied/,
        }
      );
    });
  });
});
