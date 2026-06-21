/**
 * @module @vizzly-testing/cli/client
 * @description Thin client for test runners - minimal API for taking screenshots
 */

import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, join, parse } from 'node:path';
import {
  getBuildId,
  getServerUrl,
  isTddMode,
  setVizzlyEnabled,
} from '../utils/environment-config.js';
import { normalizeScreenshotOptions } from '../utils/screenshot-options.js';

// Internal client state
let currentClient = null;
let currentServerUrl = null;
let isDisabled = false;
let currentFailOnDiff = false;

// Default timeout for screenshot requests (30 seconds)
let DEFAULT_TIMEOUT_MS = 30000;

// Log levels for client SDK output control
export let LOG_LEVELS = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3 });

function getEnvFailOnDiff(env = process.env) {
  return env.VIZZLY_FAIL_ON_DIFF === 'true' || env.VIZZLY_FAIL_ON_DIFF === '1';
}

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
  currentServerUrl = null;
}

/**
 * Auto-discover local TDD server by checking for server.json
 * @param {string} [startDir] - Directory to start search from (defaults to cwd)
 * @param {Object} [deps] - Injectable dependencies for testing
 * @returns {string|null} Server URL if found
 */
export function autoDiscoverTddServer(startDir, deps = {}) {
  let {
    exists = existsSync,
    readFile = readFileSync,
    env = process.env,
  } = deps;
  try {
    // Look for .vizzly/server.json in current directory and parent directories
    let currentDir = startDir || process.cwd();
    let root = parse(currentDir).root;

    while (currentDir !== root) {
      let serverJsonPath = join(currentDir, '.vizzly', 'server.json');

      if (exists(serverJsonPath)) {
        try {
          let serverInfo = JSON.parse(readFile(serverJsonPath, 'utf8'));
          if (serverInfo.port) {
            let url = `http://localhost:${serverInfo.port}`;
            currentFailOnDiff =
              getEnvFailOnDiff(env) || Boolean(serverInfo.failOnDiff);
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
    currentFailOnDiff = getEnvFailOnDiff();

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
      currentServerUrl = serverUrl;
      currentClient = createSimpleClient(serverUrl, {
        failOnDiff: currentFailOnDiff,
      });
    }
  }
  return currentClient;
}

/**
 * Make HTTP/HTTPS request without keep-alive (so process can exit promptly)
 * @private
 * @param {string} url - Full URL to POST to (http or https)
 * @param {object} body - JSON-serializable request body
 * @param {number} timeoutMs - Request timeout in milliseconds
 * @returns {Promise<{status: number, json: any}>} Response status and parsed JSON body
 */
function httpPost(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsedUrl = new URL(url);
    let data = JSON.stringify(body);
    let isHttps = parsedUrl.protocol === 'https:';
    let request = isHttps ? httpsRequest : httpRequest;

    let req = request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Connection: 'close',
        },
        agent: false, // Disable keep-alive agent so process can exit promptly
      },
      res => {
        let chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          let responseBody = Buffer.concat(chunks).toString();
          let json = null;
          try {
            json = JSON.parse(responseBody);
          } catch (err) {
            if (shouldLogClient('debug')) {
              console.debug(
                `[vizzly] Failed to parse response: ${err.message}`
              );
            }
            json = { error: responseBody };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Create a simple HTTP client for screenshots
 * @private
 */
function createSimpleClient(serverUrl, clientOptions = {}) {
  let { failOnDiff = false } = clientOptions;

  return {
    async screenshot(name, imageBuffer, options = {}) {
      let normalizedOptions = normalizeScreenshotOptions(options);
      let requestTimeout =
        normalizedOptions.requestTimeout || DEFAULT_TIMEOUT_MS;

      for (let warning of normalizedOptions.warnings) {
        console.warn(`[vizzly] ${warning.message}`);
      }

      try {
        // If it's a string, assume it's a file path and send directly
        // Otherwise it's a Buffer, so convert to base64
        let isFilePath = typeof imageBuffer === 'string';
        let image = isFilePath ? imageBuffer : imageBuffer.toString('base64');
        let type = isFilePath ? 'file-path' : 'base64';

        let dom = normalizedOptions.dom;
        if (!dom && normalizedOptions.captureDom) {
          dom = await captureDomSnapshot(normalizedOptions.page);
        }

        let screenshotData = {
          buildId: normalizedOptions.buildId ?? getBuildId(),
          name,
          image,
          type,
          properties: normalizedOptions.properties,
        };
        if (dom) {
          screenshotData.dom = dom;
        }
        if (normalizedOptions.warnings.length > 0) {
          screenshotData.warnings = normalizedOptions.warnings;
        }

        let httpStart = Date.now();
        let { status, json } = await httpPost(
          `${serverUrl}/screenshot`,
          screenshotData,
          requestTimeout
        );
        let httpMs = Date.now() - httpStart;

        if (shouldLogClient('debug')) {
          console.debug(
            `[vizzly-client] ${name} HTTP completed in ${httpMs}ms`
          );
        }

        if (status < 200 || status >= 300) {
          // In TDD mode, if we get 422 (visual difference), don't throw
          // This allows all screenshots in the test to be captured and compared
          // The summary will show all failures at the end
          if (status === 422 && json.tddMode && json.comparison) {
            let comp = json.comparison;

            if (failOnDiff) {
              throw new Error(
                `Visual diff detected for "${comp.name}" (${comp.diffPercentage ?? 0}% difference)`
              );
            }

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
            `Screenshot failed: ${status} - ${json.error || 'Unknown error'}`
          );
        }

        if (
          failOnDiff &&
          json?.tddMode &&
          ['diff', 'failed'].includes(json.status)
        ) {
          throw new Error(
            `Visual diff detected for "${json.name || name}" (${json.diffPercentage ?? 0}% difference)`
          );
        }

        return json;
      } catch (error) {
        // Handle timeout
        if (error.message === 'Request timeout') {
          if (shouldLogClient('error')) {
            console.error(
              `[vizzly] Screenshot timed out for "${name}" after ${requestTimeout / 1000}s`
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
          if (error.code === 'ECONNREFUSED') {
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
            console.error(
              `[vizzly] Screenshot failed for ${name}: ${error.message}`
            );
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
        let { status, json } = await httpPost(
          `${serverUrl}/flush`,
          {},
          DEFAULT_TIMEOUT_MS
        );
        if (status >= 200 && status < 300) {
          return json;
        }
      } catch {
        // Silently ignore flush errors - server may not be running
      }
      return null;
    },
  };
}

async function captureDomSnapshot(page) {
  if (!page || typeof page.evaluate !== 'function') {
    return null;
  }

  try {
    return await page.evaluate(() => ({
      html: `<!doctype html>\n${document.documentElement.outerHTML}`,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      capturedAt: new Date().toISOString(),
      metadata: {
        title: document.title,
      },
    }));
  } catch (error) {
    if (shouldLogClient('warn')) {
      console.warn(`[vizzly] Failed to capture DOM: ${error.message}`);
    }
    return null;
  }
}

/**
 * Take a screenshot for visual regression testing
 *
 * @param {string} name - Unique name for the screenshot
 * @param {Buffer|string} imageBuffer - PNG image data as a Buffer, or a file path to an image
 * @param {Object} [options] - Optional configuration
 * @param {Record<string, any>} [options.properties] - Additional properties to attach to the screenshot
 * @param {number} [options.threshold] - CIEDE2000 Delta E threshold for this screenshot
 * @param {number} [options.minClusterSize] - Minimum changed cluster size for this screenshot
 * @param {boolean} [options.fullPage] - Whether this is a full page screenshot
 *
 * @returns {Promise<Object|null>} Screenshot result from the server, or null when capture is skipped
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
 *     viewport: { width: 1920, height: 1080 }
 *   },
 *   threshold: 5
 * });
 *
 * Capture failures are logged and return null so test suites can continue.
 */
export async function vizzlyScreenshot(name, imageBuffer, options = {}) {
  if (isVizzlyDisabled()) {
    return null; // Silently skip when disabled
  }

  let client = getClient();
  if (!client) {
    // Silently disable - no server running, nothing to do
    disableVizzly();
    return null;
  }

  // Pass through the original value (Buffer or file path)
  // The server will handle reading file paths
  return client.screenshot(name, imageBuffer, options);
}

/**
 * Wait for all queued screenshots to be processed
 *
 * @returns {Promise<Object|null>} Flush summary, or null if no server is connected
 *
 * @example
 * afterAll(async () => {
 *   await vizzlyFlush();
 * });
 */
export async function vizzlyFlush() {
  let client = getClient();
  if (client) {
    return client.flush();
  }
  return null;
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
  if ('failOnDiff' in config) {
    currentFailOnDiff = config.failOnDiff === true;
  } else if ('serverUrl' in config) {
    currentFailOnDiff = getEnvFailOnDiff();
  }

  if ('serverUrl' in config) {
    currentServerUrl = config.serverUrl || null;
    currentClient = config.serverUrl
      ? createSimpleClient(config.serverUrl, {
          failOnDiff: currentFailOnDiff,
        })
      : null;
  } else if ('failOnDiff' in config && currentClient && currentServerUrl) {
    currentClient = createSimpleClient(currentServerUrl, {
      failOnDiff: currentFailOnDiff,
    });
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
  let client = getClient();
  return {
    enabled: !isVizzlyDisabled(),
    serverUrl: currentServerUrl || getServerUrl() || null,
    ready: !isVizzlyDisabled() && client !== null,
    buildId: getBuildId() || null,
    tddMode: isTddMode(),
    disabled: isVizzlyDisabled(),
    failOnDiff: currentFailOnDiff,
  };
}
