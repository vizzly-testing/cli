import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { vizzlyScreenshot } from '../../src/test-support/index.js';

let originalDocument = globalThis.document;
let originalFetch = globalThis.fetch;
let originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator'
);
let originalWindow = globalThis.window;

function createElement(scrollHeight = 720) {
  return {
    style: { cssText: '' },
    scrollHeight,
  };
}

function installBrowserGlobals(fetchImpl) {
  let container = createElement();
  let testing = createElement(920);

  globalThis.document = {
    body: { offsetHeight: 0 },
    getElementById(id) {
      if (id === 'ember-testing-container') return container;
      if (id === 'ember-testing') return testing;
      return null;
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent:
        'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    },
  });

  globalThis.window = {
    __VIZZLY_SCREENSHOT_URL__: 'http://127.0.0.1:47393',
    location: { href: 'http://localhost:4200/dashboard' },
  };

  globalThis.fetch = fetchImpl;
}

function restoreBrowserGlobals() {
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;

  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
}

describe('test-support', () => {
  afterEach(() => {
    restoreBrowserGlobals();
  });

  describe('vizzlyScreenshot()', () => {
    it('forwards comparison options as screenshot properties', async () => {
      let capturedBody = null;

      installBrowserGlobals(async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return { status: 'match' };
          },
        };
      });

      let result = await vizzlyScreenshot('dashboard', {
        scope: 'page',
        fullPage: true,
        threshold: 5,
        minClusterSize: 10,
        width: 1440,
        height: 900,
        properties: {
          theme: 'dark',
        },
      });

      assert.strictEqual(result.status, 'match');
      assert.strictEqual(capturedBody.buildId, null);
      assert.strictEqual(capturedBody.name, 'dashboard');
      assert.strictEqual(capturedBody.fullPage, true);
      assert.strictEqual(capturedBody.requestTimeout, null);
      assert.deepStrictEqual(capturedBody.viewport, {
        width: 1440,
        height: 900,
      });
      assert.deepStrictEqual(capturedBody.properties, {
        framework: 'ember',
        browser: 'chromium',
        viewport_width: 1440,
        viewport_height: 900,
        url: 'http://localhost:4200/dashboard',
        theme: 'dark',
        threshold: 5,
        minClusterSize: 10,
        fullPage: true,
      });
    });

    it('keeps reserved metadata stable while allowing custom viewport metadata', async () => {
      let capturedBody = null;

      installBrowserGlobals(async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return { status: 'match' };
          },
        };
      });

      await vizzlyScreenshot('dashboard', {
        properties: {
          theme: 'dark',
          browser: 'webkit',
          framework: 'custom-framework',
          url: 'http://evil.example',
          viewport: { width: 375, height: 667 },
          viewport_width: 375,
          viewport_height: 667,
        },
      });

      assert.deepStrictEqual(capturedBody.properties, {
        framework: 'ember',
        browser: 'chromium',
        url: 'http://localhost:4200/dashboard',
        theme: 'dark',
        viewport: { width: 375, height: 667 },
        viewport_width: 375,
        viewport_height: 667,
      });
    });

    it('does not forward fullPage for element screenshots', async () => {
      let capturedBody = null;
      let styleDuringCapture = null;

      installBrowserGlobals(async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        styleDuringCapture = document.getElementById('ember-testing-container')
          .style.cssText;
        return {
          ok: true,
          async json() {
            return { status: 'match' };
          },
        };
      });

      await vizzlyScreenshot('button', {
        selector: 'button.primary',
        fullPage: true,
      });

      assert.strictEqual(
        capturedBody.selector,
        '#ember-testing button.primary'
      );
      assert.strictEqual(capturedBody.fullPage, false);
      assert.strictEqual(capturedBody.properties.fullPage, undefined);
      assert.match(styleDuringCapture, /overflow: hidden/);
      assert.doesNotMatch(styleDuringCapture, /overflow: visible/);
    });

    it('forwards injected build id and request timeout to the screenshot server', async () => {
      let capturedBody = null;
      let capturedSignal = null;

      installBrowserGlobals(async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        capturedSignal = request.signal;
        return {
          ok: true,
          async json() {
            return { status: 'match' };
          },
        };
      });
      window.__VIZZLY_BUILD_ID__ = 'build-from-run';

      await vizzlyScreenshot('dashboard', {
        requestTimeout: 25_000,
      });

      assert.strictEqual(capturedBody.buildId, 'build-from-run');
      assert.strictEqual(capturedBody.requestTimeout, 25_000);
      if (
        typeof AbortSignal !== 'undefined' &&
        typeof AbortSignal.timeout === 'function'
      ) {
        assert.ok(capturedSignal instanceof AbortSignal);
      }
    });

    it('lets per-screenshot build id override the injected build id', async () => {
      let capturedBody = null;

      installBrowserGlobals(async (_url, request) => {
        capturedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return { status: 'match' };
          },
        };
      });
      window.__VIZZLY_BUILD_ID__ = 'build-from-run';

      await vizzlyScreenshot('dashboard', {
        buildId: 'build-from-call',
      });

      assert.strictEqual(capturedBody.buildId, 'build-from-call');
    });

    it('lets per-screenshot failOnDiff false override injected fail setting', async () => {
      installBrowserGlobals(async () => ({
        ok: true,
        async json() {
          return {
            status: 'diff',
            diffPercentage: 4.2,
          };
        },
      }));
      window.__VIZZLY_FAIL_ON_DIFF__ = true;

      let result = await vizzlyScreenshot('optional-diff', {
        failOnDiff: false,
      });

      assert.strictEqual(result.status, 'diff');
    });
  });
});
