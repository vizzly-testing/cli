/**
 * Vizzly snapshot helper for Ember tests
 *
 * This module provides the vizzlySnapshot function for use in Ember
 * acceptance and integration tests. It captures screenshots and sends
 * them to Vizzly for visual comparison.
 *
 * @module @vizzly-testing/ember/test-support
 *
 * @example
 * import { module, test } from 'qunit';
 * import { visit } from '@ember/test-helpers';
 * import { setupApplicationTest } from 'ember-qunit';
 * import { vizzlySnapshot } from '@vizzly-testing/ember/test-support';
 *
 * module('Acceptance | Dashboard', function(hooks) {
 *   setupApplicationTest(hooks);
 *
 *   test('renders empty state', async function(assert) {
 *     await visit('/dashboard');
 *     await vizzlySnapshot('dashboard-empty');
 *     assert.dom('[data-test-empty-state]').exists();
 *   });
 * });
 */

/**
 * Detect browser type from user agent
 * @returns {string} Browser type: chromium, firefox, or webkit
 */
function detectBrowser() {
  let ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'webkit';
  return 'chromium';
}

/**
 * Get the Ember settled function if available
 * Uses only AMD require to avoid bundler issues with dynamic imports
 * @returns {Function|null} The settled function or null
 */
function getSettled() {
  // Use AMD require which is available in Ember's test environment
  // This avoids bundler issues with dynamic imports
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    try {
      let testHelpers = window.require('@ember/test-helpers');
      if (testHelpers?.settled) {
        return testHelpers.settled;
      }
    } catch {
      // Module not found - that's fine, we'll skip settling
    }
  }

  // Also check if it's on the global (some Ember setups do this)
  if (typeof window !== 'undefined' && window.Ember?.Test?.settled) {
    return window.Ember.Test.settled;
  }

  return null;
}

/**
 * Prepare the Ember testing container for screenshots
 *
 * By default, Ember's #ember-testing-container is scaled to 50% and positioned
 * in the bottom-right corner. This function expands it to full screen for
 * clean screenshots.
 *
 * @param {number} [width=1280] - Desired viewport width
 * @param {number} [height=720] - Desired viewport height
 * @param {boolean} [fullPage=false] - Whether to capture full scrollable content
 * @returns {Function} Cleanup function to restore original styles
 */
function prepareTestingContainer(width = 1280, height = 720, fullPage = false) {
  let container = document.getElementById('ember-testing-container');
  let testing = document.getElementById('ember-testing');

  if (!container || !testing) {
    return () => {}; // No-op if elements don't exist
  }

  // Store original styles for restoration
  let originalContainerStyle = container.style.cssText;
  let originalTestingStyle = testing.style.cssText;

  // For fullPage, we need to measure the actual content height
  let containerHeight = height;
  if (fullPage) {
    // Temporarily reset styles to measure true content height
    testing.style.transform = 'none';
    testing.style.width = `${width}px`;
    testing.style.height = 'auto';
    testing.style.overflow = 'visible';

    // Force layout recalc and get scroll height
    let scrollHeight = testing.scrollHeight;
    containerHeight = Math.max(height, scrollHeight);
  }

  // Expand container to full screen with specified dimensions
  container.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: auto !important;
    bottom: auto !important;
    width: ${width}px !important;
    height: ${containerHeight}px !important;
    z-index: 99999 !important;
    background: #fff !important;
    border: none !important;
    overflow: ${fullPage ? 'visible' : 'hidden'} !important;
  `;

  // Reset testing element to full size (no scaling)
  testing.style.cssText = `
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: ${fullPage ? 'auto' : '100%'} !important;
    min-height: ${fullPage ? `${containerHeight}px` : 'auto'} !important;
    transform: none !important;
    overflow: ${fullPage ? 'visible' : 'hidden'} !important;
  `;

  // Return cleanup function
  return () => {
    container.style.cssText = originalContainerStyle;
    testing.style.cssText = originalTestingStyle;
  };
}

/**
 * Capture a visual snapshot
 *
 * Takes a screenshot of the Ember app and sends it to Vizzly for visual
 * comparison. By default, captures just the #ember-testing element (the app),
 * not the QUnit test runner UI.
 *
 * Automatically:
 * - Waits for Ember's settled state
 * - Expands the testing container to full viewport size
 * - Captures the app at the specified viewport dimensions
 *
 * @param {string} name - Unique name for this snapshot
 * @param {Object} [options] - Snapshot options
 * @param {string} [options.selector] - CSS selector to capture specific element within the app
 * @param {boolean} [options.fullPage=false] - Capture full scrollable content
 * @param {number} [options.width=1280] - Viewport width for the snapshot
 * @param {number} [options.height=720] - Viewport height for the snapshot
 * @param {string} [options.scope='app'] - What to capture: 'app' (default), 'container', or 'page'
 * @param {Object} [options.properties] - Additional metadata for the snapshot
 * @returns {Promise<Object>} Snapshot result from Vizzly server
 *
 * @example
 * // Capture the app at default viewport (1280x720)
 * await vizzlySnapshot('homepage');
 *
 * @example
 * // Capture at mobile viewport
 * await vizzlySnapshot('homepage-mobile', { width: 375, height: 667 });
 *
 * @example
 * // Capture specific element within the app
 * await vizzlySnapshot('login-form', { selector: '[data-test-login-form]' });
 *
 * @example
 * // Capture the entire page including QUnit UI (rare use case)
 * await vizzlySnapshot('test-runner', { scope: 'page' });
 */
export async function vizzlySnapshot(name, options = {}) {
  let {
    selector = null,
    fullPage = false,
    width = 1280,
    height = 720,
    scope = 'app',
    properties = {},
  } = options;

  // Get snapshot URL injected by the launcher
  let snapshotUrl = window.__VIZZLY_SNAPSHOT_URL__;

  if (!snapshotUrl) {
    console.warn(
      '[vizzly] No snapshot server available. Tests must be run via Vizzly launcher. ' +
        'Ensure testem.js is configured with @vizzly-testing/ember.'
    );
    return { skipped: true, reason: 'no-server' };
  }

  // Wait for Ember to settle before capturing
  let settled = getSettled();
  if (settled) {
    await settled();
  }

  // Prepare testing container for screenshot (expand to full size)
  let cleanup = prepareTestingContainer(width, height, fullPage);

  // Force a repaint to ensure styles are applied
  // eslint-disable-next-line no-unused-expressions
  document.body.offsetHeight;

  // Determine what selector to pass to Playwright
  let captureSelector = null;

  if (selector) {
    // User specified a selector - capture that element
    // Prefix with #ember-testing if not already scoped
    captureSelector = selector.startsWith('#ember-testing')
      ? selector
      : `#ember-testing ${selector}`;
  } else if (scope === 'app') {
    // Default: capture just the Ember app
    captureSelector = '#ember-testing';
  } else if (scope === 'container') {
    // Capture the testing container
    captureSelector = '#ember-testing-container';
  }
  // scope === 'page' means captureSelector stays null (full page)

  // Build request payload
  let payload = {
    name,
    selector: captureSelector,
    fullPage,
    properties: {
      browser: detectBrowser(),
      viewport_width: width,
      viewport_height: height,
      ...properties,
    },
  };

  try {
    // Send snapshot request to server
    let response = await fetch(`${snapshotUrl}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorText = await response.text();

      // Check if this is a "no server" error - gracefully skip instead of failing
      // This allows tests to pass when Vizzly isn't running (like Percy behavior)
      if (errorText.includes('No Vizzly server found')) {
        console.warn('[vizzly] Vizzly server not running. Skipping visual snapshot.');
        return { skipped: true, reason: 'no-server' };
      }

      throw new Error(`Vizzly snapshot failed: ${errorText}`);
    }

    return await response.json();
  } finally {
    // Always restore original styles
    cleanup();
  }
}

/**
 * Check if Vizzly is available in the current test environment
 * @returns {boolean} True if Vizzly snapshot server is available
 */
export function isVizzlyAvailable() {
  return !!window.__VIZZLY_SNAPSHOT_URL__;
}
