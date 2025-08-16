/**
 * @module @vizzly-testing/cli/client
 * @description Thin client for test runners - minimal API for taking screenshots
 */

import {
  isVizzlyEnabled,
  getServerUrl,
  getBuildId,
  isTddMode,
  setVizzlyEnabled,
} from '../utils/environment-config.js';

// Internal client state
let currentClient = null;
let isDisabled = false;

/**
 * Check if Vizzly is currently disabled
 * @private
 * @returns {boolean} True if disabled via environment variable or auto-disabled due to failure
 */
function isVizzlyDisabled() {
  return !isVizzlyEnabled() || isDisabled;
}

/**
 * Disable Vizzly SDK for the current session
 * @private
 * @param {string} [reason] - Optional reason for disabling
 */
function disableVizzly(reason = 'disabled') {
  isDisabled = true;
  currentClient = null;
  if (reason !== 'disabled') {
    console.warn(
      `Vizzly SDK disabled due to ${reason}. Screenshots will be skipped for the remainder of this session.`
    );
  }
}

/**
 * Get the current client instance
 * @private
 */
function getClient() {
  if (isVizzlyDisabled()) {
    return null;
  }

  if (!currentClient) {
    // Only try to initialize if VIZZLY_ENABLED is explicitly true
    const serverUrl = getServerUrl();
    if (serverUrl && isVizzlyEnabled()) {
      currentClient = createSimpleClient(serverUrl);
    }
  }
  return currentClient;
}

/**
 * Create a simple HTTP client for screenshots
 * @private
 */
function createSimpleClient(serverUrl) {
  return {
    async screenshot(name, imageBuffer, options = {}) {
      try {
        const response = await fetch(`${serverUrl}/screenshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            buildId: getBuildId(),
            name,
            image: imageBuffer.toString('base64'),
            properties: options,
            threshold: options.threshold || 0,
            variant: options.variant,
            fullPage: options.fullPage || false,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(async () => {
            const errorText = await response
              .text()
              .catch(() => 'Unknown error');
            return { error: errorText };
          });

          // In TDD mode, if we get 422 (visual difference), throw with clean message
          if (
            response.status === 422 &&
            errorData.tddMode &&
            errorData.comparison
          ) {
            const comp = errorData.comparison;
            throw new Error(
              `Visual difference detected in "${name}"\n` +
                `  Baseline: ${comp.baseline}\n` +
                `  Current:  ${comp.current}\n` +
                `  Diff:     ${comp.diff}`
            );
          }

          throw new Error(
            `Screenshot failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`
          );
        }

        return await response.json();
      } catch (error) {
        // In TDD mode with visual differences, throw the error to fail the test
        if (error.message.includes('Visual difference detected')) {
          // Clean output for TDD mode - don't spam with additional logs
          throw error;
        }

        console.error(`Failed to save screenshot "${name}":`, error.message);
        console.error(`Vizzly screenshot failed for ${name}: ${error.message}`);

        if (error.message.includes('fetch') || error.code === 'ECONNREFUSED') {
          console.error(`Server URL: ${serverUrl}/screenshot`);
          console.error(
            'This usually means the Vizzly server is not running or not accessible'
          );
          console.error(
            'Check that the server is started and the port is correct'
          );
        } else if (
          error.message.includes('404') ||
          error.message.includes('Not Found')
        ) {
          console.error(`Server URL: ${serverUrl}/screenshot`);
          console.error(
            'The screenshot endpoint was not found - check server configuration'
          );
        }

        // Disable the SDK after first failure to prevent spam
        disableVizzly('failure');

        // Don't throw - just return silently to not break tests (except TDD mode)
        return null;
      }
    },

    async flush() {
      // Simple client doesn't need explicit flushing
      return Promise.resolve();
    },
  };
}

/**
 * Take a screenshot for visual regression testing
 *
 * @param {string} name - Unique name for the screenshot
 * @param {Buffer} imageBuffer - PNG image data as a Buffer
 * @param {Object} [options] - Optional configuration
 * @param {Record<string, any>} [options.properties] - Additional properties to attach to the screenshot
 * @param {number} [options.threshold=0] - Pixel difference threshold (0-100)
 * @param {string} [options.variant] - Variant name for organizing screenshots
 * @param {boolean} [options.fullPage=false] - Whether this is a full page screenshot
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Basic usage
 * import { vizzlyScreenshot } from '@vizzly-testing/cli/client';
 *
 * const screenshot = await page.screenshot();
 * await vizzlyScreenshot('homepage', screenshot);
 *
 * @example
 * // With properties and threshold
 * await vizzlyScreenshot('checkout-form', screenshot, {
 *   properties: {
 *     browser: 'chrome',
 *     viewport: '1920x1080'
 *   },
 *   threshold: 5
 * });
 *
 * @throws {VizzlyError} When screenshot capture fails or client is not initialized
 */
export async function vizzlyScreenshot(name, imageBuffer, options = {}) {
  if (isVizzlyDisabled()) {
    return; // Silently skip when disabled
  }

  const client = getClient();
  if (!client) {
    console.warn('Vizzly client not initialized. Screenshots will be skipped.');
    return;
  }

  return client.screenshot(name, imageBuffer, options);
}

/**
 * Wait for all queued screenshots to be processed
 *
 * @returns {Promise<void>}
 *
 * @example
 * afterAll(async () => {
 *   await vizzlyFlush();
 * });
 */
export async function vizzlyFlush() {
  const client = getClient();
  if (client) {
    return client.flush();
  }
}

/**
 * Check if the Vizzly client is initialized and ready
 *
 * @returns {boolean} True if client is ready, false otherwise
 */
export function isVizzlyReady() {
  return !isVizzlyDisabled() && getClient() !== null;
}

/**
 * Configure the client with custom settings
 *
 * @param {Object} config - Configuration options
 * @param {string} [config.serverUrl] - Server URL override
 * @param {boolean} [config.enabled] - Enable/disable screenshots
 */
export function configure(config = {}) {
  if (config.serverUrl) {
    currentClient = createSimpleClient(config.serverUrl);
  }

  if (typeof config.enabled === 'boolean') {
    setVizzlyEnabled(config.enabled);
    if (!config.enabled) {
      disableVizzly();
    } else {
      isDisabled = false;
    }
  }
}

/**
 * Enable or disable screenshot capture
 * @param {boolean} enabled - Whether to enable screenshots
 */
export function setEnabled(enabled) {
  configure({ enabled });
}

/**
 * Get information about Vizzly client state
 * @returns {Object} Client information
 */
export function getVizzlyInfo() {
  const client = getClient();
  return {
    enabled: !isVizzlyDisabled(),
    serverUrl: getServerUrl(),
    ready: !isVizzlyDisabled() && client !== null,
    buildId: getBuildId(),
    tddMode: isTddMode(),
    disabled: isVizzlyDisabled(),
  };
}
