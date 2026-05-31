/**
 * Vitest setup file for Vizzly plugin
 * This extends the expect API with our custom toMatchScreenshot matcher
 */
import { expect } from 'vitest';

export function buildScreenshotProperties(
  options = {},
  locationHref = '',
  context = {}
) {
  let customProperties = options.properties ?? {};
  let customViewport = customProperties.viewport;
  let customViewportWidth = customProperties.viewport_width;
  let customViewportHeight = customProperties.viewport_height;
  let viewportWidth = context.viewport?.width;
  let viewportHeight = context.viewport?.height;
  let properties = {
    ...customProperties,
    framework: 'vitest',
    vitest: true,
    url: locationHref,
    browser: context.browser || detectBrowser(),
  };

  if (Number.isFinite(viewportWidth) && Number.isFinite(viewportHeight)) {
    properties.viewport = { width: viewportWidth, height: viewportHeight };
    properties.viewport_width = viewportWidth;
    properties.viewport_height = viewportHeight;
  }

  if (customViewport !== undefined) {
    properties.viewport = customViewport;
  }

  if (customViewportWidth !== undefined) {
    properties.viewport_width = customViewportWidth;
  }

  if (customViewportHeight !== undefined) {
    properties.viewport_height = customViewportHeight;
  }

  if (options.threshold !== undefined) {
    properties.threshold = options.threshold;
  }

  if (options.minClusterSize !== undefined) {
    properties.minClusterSize = options.minClusterSize;
  }

  if (!context.element && options.fullPage !== undefined) {
    properties.fullPage = options.fullPage;
  }

  return properties;
}

export function detectBrowser(userAgent = globalThis.navigator?.userAgent) {
  if (!userAgent) return 'unknown';

  let normalizedUserAgent = userAgent.toLowerCase();

  if (normalizedUserAgent.includes('firefox')) return 'firefox';
  if (normalizedUserAgent.includes('edg/')) return 'edge';
  if (normalizedUserAgent.includes('chrome')) return 'chromium';
  if (normalizedUserAgent.includes('safari')) return 'webkit';

  return 'unknown';
}

export function buildScreenshotCaptureOptions(options = {}, context = {}) {
  let captureOptions = { ...options };
  delete captureOptions.properties;
  delete captureOptions.threshold;
  delete captureOptions.minClusterSize;
  delete captureOptions.failOnDiff;
  delete captureOptions.buildId;
  delete captureOptions.requestTimeout;

  if (context.element) {
    delete captureOptions.fullPage;
  }

  return captureOptions;
}

export function normalizeScreenshotMatcherArgs(name, options = {}) {
  if (name && typeof name === 'object') {
    return { name: undefined, options: name };
  }

  return { name, options };
}

export function isElementScreenshotTarget(target, page) {
  return (
    target &&
    target !== page &&
    typeof target === 'object' &&
    typeof target.screenshot === 'function'
  );
}

export function shouldFailOnDiff(override = null) {
  if (override !== null && override !== undefined) {
    return override === true;
  }

  let value =
    typeof __VIZZLY_FAIL_ON_DIFF__ !== 'undefined'
      ? __VIZZLY_FAIL_ON_DIFF__
      : '';
  return value === true || value === 'true' || value === '1';
}

// Custom matcher that completely replaces Vitest's toMatchScreenshot
// This runs in browser context, so we make direct HTTP calls instead of using Node SDK
async function toMatchScreenshot(element, name, options = {}) {
  let args = normalizeScreenshotMatcherArgs(name, options);
  name = args.name;
  options = args.options;

  let serverUrl =
    typeof __VIZZLY_SERVER_URL__ !== 'undefined' ? __VIZZLY_SERVER_URL__ : '';
  let buildId =
    typeof __VIZZLY_BUILD_ID__ !== 'undefined' ? __VIZZLY_BUILD_ID__ : '';

  // If no server URL, Vizzly is not available
  if (!serverUrl) {
    return {
      pass: true,
      message: () =>
        'Vizzly not available. Run `vizzly tdd start` or `vizzly run "pnpm test"` to enable visual testing.',
    };
  }

  // Import page from Vitest browser context
  let { page } = await import('vitest/browser');

  // Take screenshot - Vitest browser mode returns a file path, not the image data
  let screenshotPath;
  if (isElementScreenshotTarget(element, page)) {
    let captureOptions = buildScreenshotCaptureOptions(options, {
      element: true,
    });
    screenshotPath = await element.screenshot(captureOptions);
  } else {
    // It's the page object
    let captureOptions = buildScreenshotCaptureOptions(options);
    screenshotPath = await page.screenshot(captureOptions);
  }

  let screenshotName = name || `screenshot-${Date.now()}`;

  // Prepare properties
  let properties = buildScreenshotProperties(options, window.location.href, {
    element: isElementScreenshotTarget(element, page),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  });

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
        pass: true,
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

      if (!shouldFailOnDiff(options.failOnDiff)) {
        return {
          pass: true,
          message: () =>
            `Visual difference recorded: ${screenshotName} (${diffPercent}% difference). View at http://localhost:47392/dashboard`,
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
      errorMessage = `Vizzly server not reachable at ${serverUrl}. Is the TDD server running? Run 'vizzly tdd start' or 'vizzly run "pnpm test"'.`;
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
