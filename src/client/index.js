/**
 * @module @vizzly-test/cli/client
 * @description Thin client for test runners - minimal API for taking screenshots
 */

// Internal client state
let currentClient = null;

/**
 * Get the current client instance
 * @private
 */
function getClient() {
  if (!currentClient) {
    // Try to initialize from environment
    const serverUrl = process.env.VIZZLY_SERVER_URL || 'http://localhost:3001';
    if (serverUrl && process.env.VIZZLY_ENABLED !== 'false') {
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
            name,
            image: imageBuffer.toString('base64'),
            properties: options.properties || {},
            threshold: options.threshold || 0,
            variant: options.variant,
            fullPage: options.fullPage || false,
          }),
        });

        if (!response.ok) {
          throw new Error(`Screenshot failed: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error(`Failed to save screenshot "${name}":`, error.message);
        throw error;
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
 * import { vizzlyScreenshot } from '@vizzly-test/cli/client';
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
  if (process.env.VIZZLY_ENABLED === 'false') {
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
  return getClient() !== null;
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
    process.env.VIZZLY_ENABLED = config.enabled ? 'true' : 'false';
    if (!config.enabled) {
      currentClient = null;
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
    enabled: process.env.VIZZLY_ENABLED !== 'false',
    serverUrl: process.env.VIZZLY_SERVER_URL || 'http://localhost:3001',
    ready: client !== null,
    buildId: process.env.VIZZLY_BUILD_ID,
    tddMode: process.env.VIZZLY_TDD === 'true',
  };
}
