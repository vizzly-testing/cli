/**
 * Vitest setup file for Vizzly plugin
 * This extends the expect API with our custom toMatchScreenshot matcher
 */
import { expect } from 'vitest';

// Custom matcher that completely replaces Vitest's toMatchScreenshot
// This runs in browser context, so we make direct HTTP calls instead of using Node SDK
async function toMatchScreenshot(element, name, options = {}) {
  let serverUrl =
    typeof __VIZZLY_SERVER_URL__ !== 'undefined' ? __VIZZLY_SERVER_URL__ : '';
  let buildId =
    typeof __VIZZLY_BUILD_ID__ !== 'undefined' ? __VIZZLY_BUILD_ID__ : '';

  // If no server URL, Vizzly is not available
  if (!serverUrl) {
    return {
      pass: true,
      message: () =>
        'Vizzly not available. Run `vizzly tdd start` or `vizzly run "npm test"` to enable visual testing.',
    };
  }

  // Import page from Vitest browser context
  const { page } = await import('vitest/browser');

  // Take screenshot - Vitest browser mode returns a file path, not the image data
  let screenshotPath;
  if (typeof element === 'object' && element.locator) {
    // It's a Playwright locator
    screenshotPath = await element.screenshot(options);
  } else {
    // It's the page object
    screenshotPath = await page.screenshot(options);
  }

  let screenshotName = name || `screenshot-${Date.now()}`;

  // Extract options from top-level
  let threshold = options.threshold ?? 0;
  let fullPage = options.fullPage;
  let customProperties = options.properties ?? {};

  // Prepare properties
  let properties = {
    framework: 'vitest',
    vitest: true,
    url: page.url(),
    ...customProperties,
  };

  try {
    // Vitest browser mode saves screenshots to disk and returns the file path
    // The TDD server can read the file directly since it's on the same machine
    // Just send the path as-is
    let response = await fetch(`${serverUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: screenshotName,
        image: screenshotPath, // Send file path directly
        type: 'file-path',
        buildId: buildId || null,
        threshold,
        fullPage,
        properties,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let result = await response.json();

    // In cloud mode, always pass
    if (buildId) {
      return {
        pass: true,
        message: () => '',
      };
    }

    // In TDD mode, check comparison result
    // TDD handler returns { success, comparison: { name, status } }
    let comparison = result.comparison || result;
    let comparisonStatus = comparison.status;

    if (comparisonStatus === 'new') {
      return {
        pass: false,
        message: () =>
          `New screenshot baseline created: ${screenshotName}. View at http://localhost:47392/dashboard`,
      };
    } else if (comparisonStatus === 'match') {
      return {
        pass: true,
        message: () => '',
      };
    } else if (comparisonStatus === 'baseline-updated') {
      return {
        pass: true,
        message: () =>
          `Baseline updated: ${screenshotName}. View at http://localhost:47392/dashboard`,
      };
    } else if (comparisonStatus === 'diff') {
      let diffPercent = comparison.diffPercentage
        ? comparison.diffPercentage.toFixed(2)
        : '0.00';

      if (comparison.diffPercentage <= threshold) {
        return {
          pass: true,
          message: () =>
            `Screenshot within threshold: ${screenshotName} (${diffPercent}% ≤ ${threshold.toFixed(2)}%)`,
        };
      }

      return {
        pass: false,
        message: () =>
          `Visual difference detected: ${screenshotName} (${diffPercent}% difference). View at http://localhost:47392/dashboard`,
      };
    }

    // Unknown status
    return {
      pass: false,
      message: () => `Unknown comparison status: ${comparisonStatus}`,
    };
  } catch (error) {
    // Differentiate between error types for better debugging
    let errorMessage;

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = `Vizzly server not reachable at ${serverUrl}. Is the TDD server running? Run 'vizzly tdd start' or 'vizzly run "npm test"'.`;
    } else if (
      error.message.includes('HTTP 500') ||
      error.message.includes('HTTP 502') ||
      error.message.includes('HTTP 503')
    ) {
      errorMessage = `Vizzly server error: ${error.message}. Check the TDD server logs for details.`;
    } else if (error.message.includes('screenshot')) {
      errorMessage = `Screenshot capture failed: ${error.message}. Check that the element exists and is visible.`;
    } else {
      errorMessage = `Vizzly screenshot failed: ${error.message}`;
    }

    return {
      pass: false,
      message: () => errorMessage,
    };
  }
}

// Extend expect with our custom matcher
expect.extend({
  toMatchScreenshot,
});
