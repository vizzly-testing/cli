/**
 * Vizzly Screenshot Comparator for Vitest Browser Mode
 *
 * This provides a custom screenshot comparator that integrates Vizzly with Vitest's
 * native `toMatchScreenshot` matcher. Users write standard Vitest tests, and Vizzly
 * handles comparison, storage, and team collaboration.
 *
 * IMPORTANT: This comparator fully integrates with Vizzly's infrastructure:
 * - TDD Mode: Uses TDD service for local comparisons with dashboard
 * - Run/Cloud Mode: Sends screenshots to server for upload to Vizzly cloud
 *
 * @module @vizzly-testing/vitest
 *
 * @example
 * // vitest.config.js
 * import { defineConfig } from 'vitest/config'
 * import { vizzlyPlugin } from '@vizzly-testing/vitest'
 *
 * export default defineConfig({
 *   plugins: [vizzlyPlugin()],
 *   test: {
 *     browser: {
 *       enabled: true,
 *       name: 'chromium',
 *       provider: 'playwright'
 *     }
 *   }
 * })
 *
 * @example
 * // test file - use Vitest's native matcher with Vizzly properties!
 * import { expect, test } from 'vitest'
 * import { page } from '@vitest/browser/context'
 *
 * test('homepage looks correct', async () => {
 *   await page.goto('/')
 *   await expect(page).toMatchScreenshot('hero.png', {
 *     vizzly: {
 *       properties: {
 *         theme: 'dark',
 *         viewport: '1920x1080'
 *       }
 *     }
 *   })
 * })
 */

import { getVizzlyInfo } from '@vizzly-testing/cli/client';
import { PNG } from 'pngjs';
import { resolve } from 'path';

// For TDD mode only
let tddService = null;
let tddServiceError = null;

/**
 * Get or create the TDD service instance (TDD mode only)
 * @private
 */
async function getTDDService() {
  if (tddServiceError) {
    throw tddServiceError;
  }

  if (!tddService) {
    try {
      // Dynamically import TDD service only when needed
      const { createTDDService } = await import('@vizzly-testing/cli');

      tddService = createTDDService(
        {
          comparison: {
            threshold: 0.01, // Default 1% threshold
          },
        },
        {
          workingDir: process.cwd(),
        }
      );
    } catch (error) {
      tddServiceError = error;
      throw error;
    }
  }

  return tddService;
}

/**
 * Convert raw RGBA pixel data to PNG buffer
 * @private
 * @param {TypedArray} pixelData - Raw RGBA pixel data from Vitest
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Buffer} PNG encoded buffer
 */
function pixelDataToPNG(pixelData, width, height) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixelData);
  return PNG.sync.write(png);
}

/**
 * Vizzly screenshot comparator for Vitest
 *
 * This comparator integrates with Vitest's native `toMatchScreenshot` matcher,
 * allowing you to use Vizzly's visual testing platform seamlessly.
 *
 * **How it works:**
 *
 * **TDD Mode** (`vizzly tdd start`):
 * 1. Vitest captures screenshots and passes pixel data to comparator
 * 2. Comparator converts to PNG and sends to Vizzly's TDD service
 * 3. Vizzly manages baselines in `.vizzly/baselines/`
 * 4. Returns comparison result to Vitest
 * 5. Results appear in dashboard at http://localhost:47392/dashboard
 *
 * **Run/Cloud Mode** (`vizzly run "npx vitest"`):
 * 1. Vitest captures screenshots and passes pixel data to comparator
 * 2. Comparator converts to PNG and sends to Vizzly screenshot server
 * 3. Server queues screenshots for upload to cloud
 * 4. Tests pass (comparison happens in cloud after upload)
 * 5. Results appear in Vizzly web dashboard
 *
 * @param {Object} reference - Reference screenshot data
 * @param {TypedArray} reference.data - Pixel data as TypedArray
 * @param {Object} reference.metadata - Image metadata
 * @param {number} reference.metadata.width - Image width
 * @param {number} reference.metadata.height - Image height
 * @param {Object} actual - Current screenshot data
 * @param {TypedArray} actual.data - Pixel data as TypedArray
 * @param {Object} actual.metadata - Image metadata
 * @param {Object} options - Comparison options
 * @param {boolean} options.createDiff - Whether to create diff image
 * @param {Object} [options.vizzly] - Vizzly-specific options
 * @param {Record<string, any>} [options.vizzly.properties] - Custom metadata properties
 * @param {number} [options.vizzly.threshold] - Comparison threshold (0-100)
 * @param {boolean} [options.vizzly.fullPage] - Whether this is a full page screenshot
 * @param {string} [options.vizzly.name] - Screenshot name (injected by plugin)
 *
 * @returns {Promise<{pass: boolean, diff: TypedArray | null, message: string | null}>}
 *
 * @example
 * // In vitest.config.js
 * import { vizzlyPlugin } from '@vizzly-testing/vitest'
 *
 * export default defineConfig({
 *   plugins: [vizzlyPlugin()],
 *   test: {
 *     browser: {
 *       enabled: true,
 *       name: 'chromium',
 *       provider: 'playwright'
 *     }
 *   }
 * })
 *
 * @example
 * // In test file - use native Vitest API with Vizzly properties
 * await expect(page).toMatchScreenshot('checkout.png', {
 *   vizzly: {
 *     properties: {
 *       browser: 'chromium',
 *       theme: 'dark'
 *     },
 *     threshold: 5
 *   }
 * })
 */
// Counter for auto-generating screenshot names (similar to Vitest's internal counter)
const screenshotCounters = new Map();

export async function vizzlyComparator(reference, actual, options = {}) {
  const { createDiff = false, properties = {}, threshold = 0, fullPage, name } = options;

  // Get Vizzly info to determine mode
  const info = getVizzlyInfo();

  // If Vizzly is not available, just pass - let Vitest handle it
  if (!info.ready) {
    return {
      pass: true,
      diff: null,
      message:
        'Vizzly not available. Run `npx vizzly dev start` or `npx vizzly run "npx vitest"` to enable visual testing.',
    };
  }

  // Check if we have a local server running (TDD mode)
  // If serverUrl is set but no VIZZLY_BUILD_ID env var, we're in TDD mode
  const isLocalTDD = info.serverUrl && !process.env.VIZZLY_BUILD_ID;

  try {
    // Convert pixel data to PNG buffer
    const imageBuffer = pixelDataToPNG(
      actual.data,
      actual.metadata.width,
      actual.metadata.height
    );

    // Generate screenshot name
    // Use provided name or auto-generate from counter
    let screenshotName = name;
    if (!screenshotName) {
      // Generate name from counter (similar to Vitest's pattern)
      const counterKey = `${actual.metadata.width}x${actual.metadata.height}`;
      let counter = screenshotCounters.get(counterKey) || 0;
      counter++;
      screenshotCounters.set(counterKey, counter);
      screenshotName = `screenshot-${counter}`;
    }

    // Prepare properties for Vizzly
    // This ensures proper signature generation for baseline matching
    const vizzlyProperties = {
      framework: 'vitest',
      vitest: true,
      width: actual.metadata.width,
      height: actual.metadata.height,
      ...properties,
    };

    // If fullPage is specified, add it to properties
    if (fullPage !== undefined) {
      vizzlyProperties.fullPage = fullPage;
    }

    // **MODE DETECTION**: Determine if we're in TDD mode or Run/Cloud mode
    // - TDD mode: local server running, no build ID (local comparison with TDD service)
    // - Run mode: upload to cloud for team review
    if (isLocalTDD) {
      // ===== TDD MODE: Local comparison with TDD service =====
      let tddService;
      try {
        tddService = await getTDDService();
      } catch (error) {
        return {
          pass: false,
          diff: null,
          message: `Vizzly TDD service initialization failed: ${error.message}`,
        };
      }

      // Call Vizzly's TDD service to compare
      // This uses the FULL Vizzly flow:
      // - Signature-based baseline matching
      // - honeydiff comparison
      // - Baseline creation for new screenshots
      // - Diff image generation
      // - Results saved for dashboard
      const comparison = await tddService.compareScreenshot(
        screenshotName,
        imageBuffer,
        vizzlyProperties
      );

      // Handle comparison result
      if (comparison.status === 'new') {
        // New screenshot - baseline created
        return {
          pass: true,
          diff: null,
          message: `New screenshot baseline created: ${screenshotName}`,
        };
      } else if (comparison.status === 'passed') {
        // Screenshots match
        return {
          pass: true,
          diff: null,
          message: null,
        };
      } else if (comparison.status === 'failed') {
        // Visual difference detected
        const diffPercent = comparison.diffPercentage
          ? comparison.diffPercentage.toFixed(2)
          : '0.00';

        // Check threshold (Vizzly uses 0-100)
        const withinThreshold = comparison.diffPercentage <= threshold;

        if (withinThreshold) {
          return {
            pass: true,
            diff: null,
            message: `Screenshot within threshold: ${screenshotName} (${diffPercent}% ≤ ${threshold.toFixed(2)}%)`,
          };
        }

        // If createDiff is requested, read the diff image
        let diffData = null;
        if (createDiff && comparison.diff) {
          try {
            const fs = await import('fs');
            const diffBuffer = fs.readFileSync(comparison.diff);
            const diffPng = PNG.sync.read(diffBuffer);
            diffData = diffPng.data;
          } catch (error) {
            // Failed to read diff - continue without it
          }
        }

        return {
          pass: false,
          diff: diffData,
          message: `Visual difference detected: ${screenshotName} (${diffPercent}% difference). View at http://localhost:47392/dashboard`,
        };
      }

      // Unknown status
      return {
        pass: false,
        diff: null,
        message: `Unknown comparison status: ${comparison.status}`,
      };
    } else {
      // ===== RUN/CLOUD MODE: Send to screenshot server for upload =====
      // In run mode, we send screenshots to the server which queues them for upload
      // Comparison happens in the cloud after all tests complete

      const { vizzlyScreenshot } = await import('@vizzly-testing/cli/client');

      const result = await vizzlyScreenshot(screenshotName, imageBuffer, {
        threshold,
        fullPage,
        properties: vizzlyProperties,
      });

      // In run mode, screenshots are queued for upload
      // Tests should pass - comparison happens in cloud
      if (result && result.success) {
        return {
          pass: true,
          diff: null,
          message: null,
        };
      }

      // Handle unexpected result
      return {
        pass: true, // Still pass - don't fail tests in run mode
        diff: null,
        message: null,
      };
    }
  } catch (error) {
    // Comparison failed
    // In TDD mode, this should fail the test
    // In run mode, we might want to pass and log error
    if (isLocalTDD) {
      return {
        pass: false,
        diff: null,
        message: `Vizzly comparison failed: ${error.message}`,
      };
    } else {
      // In run mode, log error but don't fail test
      console.warn(`Vizzly screenshot processing error: ${error.message}`);
      return {
        pass: true,
        diff: null,
        message: null,
      };
    }
  }
}

/**
 * Vitest plugin for Vizzly integration
 *
 * This plugin automatically configures Vizzly as the screenshot comparator
 * and injects the screenshot name into comparator options.
 *
 * @param {Object} [options] - Plugin options
 * @param {number} [options.threshold] - Default comparison threshold (0-100)
 * @param {Object} [options.properties] - Default custom properties
 * @param {boolean} [options.fullPage] - Default full page setting
 *
 * @returns {Object} Vitest plugin
 *
 * @example
 * import { defineConfig } from 'vitest/config'
 * import { vizzlyPlugin } from '@vizzly-testing/vitest'
 *
 * export default defineConfig({
 *   plugins: [vizzlyPlugin({ threshold: 5 })],
 *   test: {
 *     browser: {
 *       enabled: true,
 *       name: 'chromium',
 *       provider: 'playwright'
 *     }
 *   }
 * })
 */
/**
 * Custom toMatchScreenshot implementation that completely replaces Vitest's
 * This is called via expect.extend() in the setup file
 */
export async function toMatchScreenshot(element, name, options = {}) {
  let isCloudMode = !!process.env.VIZZLY_BUILD_ID;

  // Import page from Vitest browser context
  const { page } = await import('@vitest/browser/context');

  // Take screenshot
  let screenshot;
  if (typeof element === 'object' && element.locator) {
    // It's a Playwright locator
    screenshot = await element.screenshot(options);
  } else {
    // It's the page object
    screenshot = await page.screenshot(options);
  }

  let imageBuffer = Buffer.from(screenshot);
  let screenshotName = name || `screenshot-${Date.now()}`;

  // Prepare properties
  let properties = {
    framework: 'vitest',
    vitest: true,
    ...(options.vizzly?.properties || {}),
  };

  if (isCloudMode) {
    // ===== CLOUD MODE: Upload to Vizzly =====
    const { vizzlyScreenshot } = await import('@vizzly-testing/cli/client');

    await vizzlyScreenshot(screenshotName, imageBuffer, {
      threshold: options.vizzly?.threshold || 0,
      fullPage: options.vizzly?.fullPage,
      properties,
    });

    // Always pass in cloud mode
    return {
      pass: true,
      message: () => '',
    };
  } else {
    // ===== TDD MODE: Local comparison =====
    let tddService;
    try {
      tddService = await getTDDService();
    } catch (error) {
      return {
        pass: false,
        message: () => `Vizzly TDD service initialization failed: ${error.message}`,
      };
    }

    // Call Vizzly's TDD service to compare
    let comparison = await tddService.compareScreenshot(
      screenshotName,
      imageBuffer,
      properties
    );

    // Handle comparison result
    if (comparison.status === 'new') {
      return {
        pass: false,
        message: () =>
          `New screenshot baseline created: ${screenshotName}. View at http://localhost:47392/dashboard`,
      };
    } else if (comparison.status === 'passed') {
      return {
        pass: true,
        message: () => '',
      };
    } else if (comparison.status === 'failed') {
      let diffPercent = comparison.diffPercentage
        ? comparison.diffPercentage.toFixed(2)
        : '0.00';
      let threshold = options.vizzly?.threshold || 0;

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
      message: () => `Unknown comparison status: ${comparison.status}`,
    };
  }
}

export function vizzlyPlugin(options = {}) {
  return {
    name: 'vitest-vizzly',
    config(config, { mode }) {
      // Add setup file to extend expect with our custom matcher
      let setupFiles = config?.test?.setupFiles || [];
      if (!Array.isArray(setupFiles)) {
        setupFiles = [setupFiles];
      }

      return {
        test: {
          setupFiles: [...setupFiles, resolve(import.meta.dirname || __dirname, 'setup.js')],
          browser: {
            // Disable Vitest's native screenshot testing
            // Our custom matcher completely replaces it
            screenshotFailures: false,
          },
        },
        // Pass Vizzly environment variables to browser context via define
        define: {
          'import.meta.env.VIZZLY_SERVER_URL': JSON.stringify(
            process.env.VIZZLY_SERVER_URL || ''
          ),
          'import.meta.env.VIZZLY_BUILD_ID': JSON.stringify(process.env.VIZZLY_BUILD_ID || ''),
        },
      };
    },
  };
}

/**
 * Helper to get Vizzly status in tests
 *
 * @returns {Object} Vizzly client information
 * @property {boolean} enabled - Whether Vizzly is enabled
 * @property {boolean} ready - Whether client is ready
 * @property {boolean} tddMode - Whether in TDD mode
 * @property {string} serverUrl - Server URL if available
 *
 * @example
 * import { getVizzlyStatus } from '@vizzly-testing/vitest'
 *
 * test('my test', () => {
 *   const status = getVizzlyStatus()
 *   if (status.ready) {
 *     // Vizzly is available
 *   }
 * })
 */
export function getVizzlyStatus() {
  return getVizzlyInfo();
}

// Re-export client utilities for advanced usage
export { getVizzlyInfo } from '@vizzly-testing/cli/client';
