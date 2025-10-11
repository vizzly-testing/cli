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
 * Generate screenshot name from page and viewport
 * Format: "path/to/page@viewportName"
 * @param {Object} page - Page object with path property
 * @param {Object} viewport - Viewport object with name
 * @returns {string} Screenshot name
 */
export function generateScreenshotName(page, viewport) {
  let { path } = page;
  let viewportName = viewport.name;

  // Remove leading slash for cleaner names
  let cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // Handle root path
  if (!cleanPath || cleanPath === '') {
    cleanPath = 'index';
  }

  return `${cleanPath}@${viewportName}`;
}

/**
 * Capture a screenshot from a page
 * @param {Object} page - Puppeteer page instance
 * @param {Object} options - Screenshot options
 * @param {boolean} [options.fullPage=false] - Capture full page
 * @param {boolean} [options.omitBackground=false] - Omit background
 * @returns {Promise<Buffer>} Screenshot buffer
 */
export async function captureScreenshot(page, options = {}) {
  let { fullPage = false, omitBackground = false } = options;

  let screenshot = await page.screenshot({
    fullPage,
    omitBackground,
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
  let name = generateScreenshotName(pageObj, viewport);
  let screenshot = await captureScreenshot(page, screenshotOptions);

  await vizzlyScreenshot(name, screenshot);
}
