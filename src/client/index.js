/**
 * @module @vizzly-testing/cli/client
 * @description Thin client for test runners - minimal API for taking screenshots
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import {
  getBuildId,
  getServerUrl,
  isTddMode,
  setVizzlyEnabled,
} from '../utils/environment-config.js';

// Internal client state
let currentClient = null;
let isDisabled = false;

// Default timeout for screenshot requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000;

// Log levels for client SDK output control
export const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Check if client should log at the given level
 * Respects VIZZLY_CLIENT_LOG_LEVEL env var (default: 'error' - only show errors)
 * @param {string} level - Log level to check
 * @param {string} [configuredLevel] - Configured log level (defaults to env var)
 * @returns {boolean} Whether to log at this level
 */
export function shouldLogClient(level, configuredLevel) {
  let configLevel =
    configuredLevel ||
    process.env.VIZZLY_CLIENT_LOG_LEVEL?.toLowerCase() ||
    'error';
  let levelValue = LOG_LEVELS[level] ?? 0;
  let configValue = LOG_LEVELS[configLevel] ?? 3;
  return levelValue >= configValue;
}

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
 */
function disableVizzly() {
  isDisabled = true;
  currentClient = null;
}

/**
 * Auto-discover local TDD server by checking for server.json
 * @param {string} [startDir] - Directory to start search from (defaults to cwd)
 * @param {Object} [deps] - Injectable dependencies for testing
 * @returns {string|null} Server URL if found
 */
export function autoDiscoverTddServer(startDir, deps = {}) {
  let { exists = existsSync, readFile = readFileSync } = deps;
  try {
    // Look for .vizzly/server.json in current directory and parent directories
    let currentDir = startDir || process.cwd();
    const root = parse(currentDir).root;

    while (currentDir !== root) {
      const serverJsonPath = join(currentDir, '.vizzly', 'server.json');

      if (exists(serverJsonPath)) {
        try {
          const serverInfo = JSON.parse(readFile(serverJsonPath, 'utf8'));
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
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        DEFAULT_TIMEOUT_MS
      );

      try {
        // If it's a string, assume it's a file path and send directly
        // Otherwise it's a Buffer, so convert to base64
        const image =
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
            fullPage: options.fullPage || false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(async () => {
            const errorText = await response
              .text()
              .catch(() => 'Unknown error');
            return { error: errorText };
          });

          // In TDD mode, if we get 422 (visual difference), don't throw
          // This allows all screenshots in the test to be captured and compared
          // The summary will show all failures at the end
          if (
            response.status === 422 &&
            errorData.tddMode &&
            errorData.comparison
          ) {
            clearTimeout(timeoutId);
            let comp = errorData.comparison;

            // Return success so test continues and captures remaining screenshots
            // Visual diff details will be shown in the summary after tests complete
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

        clearTimeout(timeoutId);
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);

        // Handle timeout (AbortError)
        if (error.name === 'AbortError') {
          if (shouldLogClient('error')) {
            console.error(
              `[vizzly] Screenshot timed out for "${name}" after ${DEFAULT_TIMEOUT_MS / 1000}s`
            );
          }
          disableVizzly();
          return null;
        }

        // In TDD mode with visual differences, throw the error to fail the test
        if (error.message?.toLowerCase().includes('visual diff')) {
          throw error;
        }

        // Log connection errors (these indicate setup problems)
        if (shouldLogClient('error')) {
          if (
            error.message?.includes('fetch') ||
            error.code === 'ECONNREFUSED'
          ) {
            console.error(
              `[vizzly] Server not accessible at ${serverUrl}/screenshot`
            );
          } else if (
            error.message?.includes('404') ||
            error.message?.includes('Not Found')
          ) {
            console.error(
              `[vizzly] Screenshot endpoint not found at ${serverUrl}/screenshot`
            );
          } else {
            console.error(`[vizzly] Screenshot failed for ${name}`);
          }
        }

        // Disable the SDK after first failure to prevent spam
        disableVizzly();

        // Don't throw - just return silently to not break tests
        return null;
      }
    },

    async flush() {
      // Call the /flush endpoint to signal test completion and trigger summary output
      try {
        let response = await fetch(`${serverUrl}/flush`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          return response.json();
        }
      } catch {
        // Silently ignore flush errors - server may not be running
      }
      return null;
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

  let client = getClient();
  if (!client) {
    // Silently disable - no server running, nothing to do
    disableVizzly();
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
