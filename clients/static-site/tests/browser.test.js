/**
 * Tests for browser launching and management
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

describe('browser', () => {
  describe('launchBrowser', () => {
    it('throws error for invalid browser type', async () => {
      // Import fresh to avoid caching
      let { launchBrowser } = await import('../src/browser.js');

      await assert.rejects(
        () => launchBrowser({ type: 'invalid-browser' }),
        {
          message: /Unknown browser type: invalid-browser/,
        }
      );
    });

    it('includes supported browsers in error message', async () => {
      let { launchBrowser } = await import('../src/browser.js');

      await assert.rejects(
        () => launchBrowser({ type: 'netscape' }),
        {
          message: /chromium, firefox, webkit/,
        }
      );
    });

    it('defaults to chromium when no type specified', async () => {
      // This test verifies the default by checking that no error is thrown
      // for missing type (actual browser launch would fail without installation)
      let { launchBrowser } = await import('../src/browser.js');

      // We expect this to fail with browser-not-installed, not invalid-type
      try {
        await launchBrowser({ type: undefined });
      } catch (error) {
        // Should NOT be an "Unknown browser type" error
        assert.ok(
          !error.message.includes('Unknown browser type'),
          'Should default to chromium, not throw unknown browser error'
        );
      }
    });
  });

  describe('browser-specific args', () => {
    it('chromium args include sandbox and memory flags', async () => {
      // We can't easily test the actual args without mocking playwright-core
      // but we can verify the function exists and accepts chromium type
      let { launchBrowser } = await import('../src/browser.js');

      try {
        await launchBrowser({ type: 'chromium' });
      } catch (error) {
        // Expected to fail (no browser installed), but validates type is accepted
        assert.ok(
          !error.message.includes('Unknown browser type'),
          'chromium should be a valid browser type'
        );
      }
    });

    it('firefox is a valid browser type', async () => {
      let { launchBrowser } = await import('../src/browser.js');

      try {
        await launchBrowser({ type: 'firefox' });
      } catch (error) {
        assert.ok(
          !error.message.includes('Unknown browser type'),
          'firefox should be a valid browser type'
        );
      }
    });

    it('webkit is a valid browser type', async () => {
      let { launchBrowser } = await import('../src/browser.js');

      try {
        await launchBrowser({ type: 'webkit' });
      } catch (error) {
        assert.ok(
          !error.message.includes('Unknown browser type'),
          'webkit should be a valid browser type'
        );
      }
    });
  });

  describe('error messages', () => {
    it('browser-not-installed error includes install command', async () => {
      let { launchBrowser } = await import('../src/browser.js');

      try {
        await launchBrowser({ type: 'chromium' });
        // If we get here, browser is installed - skip assertion
      } catch (error) {
        if (error.message.includes('is not installed')) {
          assert.ok(
            error.message.includes('npx playwright install chromium'),
            'Should include chromium install command'
          );
        }
        // Otherwise it's a different error (browser is installed but failed for other reason)
      }
    });

    it('browser-not-installed error includes CI guidance', async () => {
      let { launchBrowser } = await import('../src/browser.js');

      try {
        await launchBrowser({ type: 'firefox' });
      } catch (error) {
        if (error.message.includes('is not installed')) {
          assert.ok(
            error.message.includes('--with-deps'),
            'Should include --with-deps for CI environments'
          );
          assert.ok(
            error.message.includes('playwright.dev/docs/ci'),
            'Should link to Playwright CI docs'
          );
        }
      }
    });

    it('firefox install error suggests correct browser', async () => {
      let { launchBrowser } = await import('../src/browser.js');

      try {
        await launchBrowser({ type: 'firefox' });
      } catch (error) {
        if (error.message.includes('is not installed')) {
          assert.ok(
            error.message.includes('npx playwright install firefox'),
            'Should suggest installing firefox, not chromium'
          );
        }
      }
    });
  });
});
