/**
 * Screenshot capture and naming
 * Pure functions for screenshot operations
 */

let vizzlyScreenshot;

// Dynamically import to avoid issues in test environment
try {
  let module = await import('@vizzly-testing/cli/client');
  vizzlyScreenshot = module.vizzlyScreenshot;
} catch (error) {
  console.warn('Warning: Could not import Vizzly client SDK:', error.message);
  // Mock for testing
  vizzlyScreenshot = async () => {};
}

/**
 * Generate screenshot name from page path
 * Viewport info goes in properties for grouping
 * @param {Object} page - Page object with path property
 * @returns {string} Screenshot name
 */
export function generateScreenshotName(page) {
  let { path } = page;

  // Remove leading slash for cleaner names
  let cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // Handle root path
  if (!cleanPath || cleanPath === '') {
    cleanPath = 'index';
  }

  // Replace slashes and backslashes with hyphens to create valid filename
  cleanPath = cleanPath.replace(/[/\\]/g, '-');

  // Replace double dots (path traversal sequences) with single dots
  cleanPath = cleanPath.replace(/\.\./g, '.');

  return cleanPath;
}

/**
 * Generate screenshot properties from viewport
 * Properties are used by Vizzly for grouping and identification
 * @param {Object} viewport - Viewport object with name, width, height
 * @returns {Object} Screenshot properties
 */
export function generateScreenshotProperties(viewport) {
  return {
    viewport: viewport.name,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  };
}

/**
 * Default screenshot timeout in milliseconds (45 seconds)
 * If a page can't render within this time, something is likely wrong
 */
let DEFAULT_SCREENSHOT_TIMEOUT = 45_000;

/**
 * Capture a screenshot from a page
 * @param {Object} page - Playwright page instance
 * @param {Object} options - Screenshot options
 * @param {boolean} [options.fullPage=false] - Capture full page
 * @param {boolean} [options.omitBackground=false] - Omit background (transparent)
 * @param {number} [options.timeout=45000] - Screenshot timeout in ms
 * @returns {Promise<Buffer>} Screenshot buffer
 */
export async function captureScreenshot(page, options = {}) {
  let {
    fullPage = false,
    omitBackground = false,
    timeout = DEFAULT_SCREENSHOT_TIMEOUT,
  } = options;

  // Playwright has built-in timeout support
  let screenshot = await page.screenshot({
    fullPage,
    omitBackground,
    timeout,
  });

  return screenshot;
}

/**
 * Capture and send screenshot to Vizzly
 * @param {Object} page - Puppeteer page instance
 * @param {Object} pageObj - Page object
 * @param {Object} viewport - Viewport object
 * @param {Object} screenshotOptions - Screenshot options
 * @returns {Promise<void>}
 */
export async function captureAndSendScreenshot(
  page,
  pageObj,
  viewport,
  screenshotOptions = {}
) {
  let name = generateScreenshotName(pageObj);
  let properties = generateScreenshotProperties(viewport);
  properties.url = page.url();
  let screenshot = await captureScreenshot(page, screenshotOptions);

  await vizzlyScreenshot(name, screenshot, { properties });
}
