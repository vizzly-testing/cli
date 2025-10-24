/**
 * Vitest setup file for Vizzly plugin
 * This extends the expect API with our custom toMatchScreenshot matcher
 */
import { expect } from 'vitest';

// Custom matcher that completely replaces Vitest's toMatchScreenshot
// This runs in browser context, so we make direct HTTP calls instead of using Node SDK
async function toMatchScreenshot(element, name, options = {}) {
  let serverUrl = import.meta.env.VIZZLY_SERVER_URL;
  let buildId = import.meta.env.VIZZLY_BUILD_ID;

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

  // Take screenshot
  let screenshot;
  if (typeof element === 'object' && element.locator) {
    // It's a Playwright locator
    screenshot = await element.screenshot(options);
  } else {
    // It's the page object
    screenshot = await page.screenshot(options);
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
    ...customProperties,
  };

  try {
    // POST screenshot to Vizzly server (works in both TDD and cloud mode)
    let response = await fetch(`${serverUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: screenshotName,
        image: Array.from(screenshot), // Convert Uint8Array to regular array for JSON
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
    if (result.status === 'new') {
      return {
        pass: false,
        message: () =>
          `New screenshot baseline created: ${screenshotName}. View at http://localhost:47392/dashboard`,
      };
    } else if (result.status === 'passed') {
      return {
        pass: true,
        message: () => '',
      };
    } else if (result.status === 'failed') {
      let diffPercent = result.diffPercentage
        ? result.diffPercentage.toFixed(2)
        : '0.00';

      if (result.diffPercentage <= threshold) {
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
      message: () => `Unknown comparison status: ${result.status}`,
    };
  } catch (error) {
    return {
      pass: false,
      message: () => `Vizzly screenshot failed: ${error.message}`,
    };
  }
}

// Extend expect with our custom matcher
expect.extend({
  toMatchScreenshot,
});
