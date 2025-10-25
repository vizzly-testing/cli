/**
 * @module @vizzly-testing/cli/client
 * @description Thin client for test runners - minimal API for taking screenshots
 */

import {
  getServerUrl,
  getBuildId,
  isTddMode,
  setVizzlyEnabled,
} from '../utils/environment-config.js';
import { existsSync, readFileSync } from 'fs';
import { join, parse, dirname } from 'path';

// Internal client state
let currentClient = null;
let isDisabled = false;
let hasLoggedWarning = false;

/**
 * Check if Vizzly is currently disabled
 * @private
 * @returns {boolean} True if disabled via environment variable or auto-disabled due to failure
 */
function isVizzlyDisabled() {
  // Don't check isVizzlyEnabled() here - let auto-discovery happen first
  return isDisabled;
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
 * Auto-discover local TDD server by checking for server.json
 * @private
 * @returns {string|null} Server URL if found
 */
function autoDiscoverTddServer() {
  try {
    // Look for .vizzly/server.json in current directory and parent directories
    let currentDir = process.cwd();
    const root = parse(currentDir).root;

    while (currentDir !== root) {
      const serverJsonPath = join(currentDir, '.vizzly', 'server.json');

      if (existsSync(serverJsonPath)) {
        try {
          const serverInfo = JSON.parse(readFileSync(serverJsonPath, 'utf8'));
          if (serverInfo.port) {
            const url = `http://localhost:${serverInfo.port}`;
            return url;
          }
        } catch {
          // Invalid JSON, continue searching
        }
      }
      currentDir = dirname(currentDir);
    }

    return null;
  } catch {
    return null;
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
    let serverUrl = getServerUrl();

    // Auto-detect local TDD server and enable Vizzly if TDD server is found
    if (!serverUrl) {
      serverUrl = autoDiscoverTddServer();
      if (serverUrl) {
        // Automatically enable Vizzly when TDD server is detected
        setVizzlyEnabled(true);
      }
    }

    // If we have a server URL, create the client (regardless of initial enabled state)
    if (serverUrl) {
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
        // If it's a string, assume it's a file path and send directly
        // Otherwise it's a Buffer, so convert to base64
        let image =
          typeof imageBuffer === 'string'
            ? imageBuffer
            : imageBuffer.toString('base64');

        const response = await fetch(`${serverUrl}/screenshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            buildId: getBuildId(),
            name,
            image,
            properties: options,
            threshold: options.threshold || 0,
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

          // In TDD mode, if we get 422 (visual difference), log but DON'T throw
          // This allows all screenshots in the test to be captured and compared
          if (
            response.status === 422 &&
            errorData.tddMode &&
            errorData.comparison
          ) {
            const comp = errorData.comparison;
            const diffPercent = comp.diffPercentage
              ? comp.diffPercentage.toFixed(2)
              : '0.00';

            // Extract port from serverUrl (e.g., "http://localhost:47392" -> "47392")
            const urlMatch = serverUrl.match(/:(\d+)/);
            const port = urlMatch ? urlMatch[1] : '47392';
            const dashboardUrl = `http://localhost:${port}/dashboard`;

            // Just log warning - don't throw by default in TDD mode
            // This allows all screenshots to be captured
            console.warn(
              `⚠️  Visual diff: ${comp.name} (${diffPercent}%) → ${dashboardUrl}`
            );

            // Return success so test continues and captures remaining screenshots
            return {
              success: true,
              status: 'failed',
              name: comp.name,
              diffPercentage: comp.diffPercentage,
            };
          }

          throw new Error(
            `Screenshot failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`
          );
        }

        return await response.json();
      } catch (error) {
        // In TDD mode with visual differences, throw the error to fail the test
        if (error.message.toLowerCase().includes('visual diff')) {
          // Clean output for TDD mode - don't spam with additional logs
          throw error;
        }

        console.error(`Vizzly screenshot failed for ${name}:`, error.message);

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
 * @param {Buffer|string} imageBuffer - PNG image data as a Buffer, or a file path to an image
 * @param {Object} [options] - Optional configuration
 * @param {Record<string, any>} [options.properties] - Additional properties to attach to the screenshot
 * @param {number} [options.threshold=0] - Pixel difference threshold (0-100)
 * @param {boolean} [options.fullPage=false] - Whether this is a full page screenshot
 *
 * @returns {Promise<void>}
 *
 * @example
 * // Basic usage with Buffer
 * import { vizzlyScreenshot } from '@vizzly-testing/cli/client';
 *
 * const screenshot = await page.screenshot();
 * await vizzlyScreenshot('homepage', screenshot);
 *
 * @example
 * // Basic usage with file path
 * await vizzlyScreenshot('homepage', './screenshots/homepage.png');
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
 * @throws {VizzlyError} When file path is provided but file doesn't exist
 * @throws {VizzlyError} When file cannot be read due to permissions or I/O errors
 */
export async function vizzlyScreenshot(name, imageBuffer, options = {}) {
  if (isVizzlyDisabled()) {
    return; // Silently skip when disabled
  }

  const client = getClient();
  if (!client) {
    if (!hasLoggedWarning) {
      console.warn(
        'Vizzly client not initialized. Screenshots will be skipped.'
      );
      hasLoggedWarning = true;
      disableVizzly();
    }
    return;
  }

  // Pass through the original value (Buffer or file path)
  // The server will handle reading file paths
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
