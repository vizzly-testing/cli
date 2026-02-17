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

/** @internal Replace vizzlyScreenshot for testing */
export function _setVizzlyScreenshot(fn) {
  vizzlyScreenshot = fn;
}

/**
 * Generate screenshot name from story and viewport
 * Format: "ComponentName-StoryName@viewportName"
 * Replaces slashes with hyphens to avoid path issues
 * @param {Object} story - Story object with title and name
 * @param {Object} viewport - Viewport object with name
 * @returns {string} Screenshot name
 */
export function generateScreenshotName(story, viewport) {
  let { title, name } = story;
  let viewportName = viewport.name;

  // Replace slashes with hyphens to create valid screenshot names
  let sanitizedTitle = title.replace(/\//g, '-');

  return `${sanitizedTitle}-${name}@${viewportName}`;
}

/**
 * Default timeout for screenshot capture (45 seconds)
 * Normal screenshots take 25-150ms; this matches static-site SDK
 */
const SCREENSHOT_TIMEOUT_MS = 45_000;

/**
 * Capture a screenshot from a page
 * @param {Object} page - Playwright page instance
 * @param {Object} options - Screenshot options
 * @param {boolean} [options.fullPage=true] - Capture full page
 * @param {boolean} [options.omitBackground=false] - Omit background (transparent)
 * @returns {Promise<Buffer>} Screenshot buffer
 */
export async function captureScreenshot(page, options = {}) {
  let { fullPage = true, omitBackground = false } = options;

  // Playwright has built-in timeout support
  let screenshot = await page.screenshot({
    fullPage,
    omitBackground,
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  return screenshot;
}

/**
 * Capture and send screenshot to Vizzly
 * @param {Object} page - Playwright page instance
 * @param {Object} story - Story object
 * @param {Object} viewport - Viewport object
 * @param {Object} screenshotOptions - Screenshot options
 * @returns {Promise<void>}
 */
export async function captureAndSendScreenshot(
  page,
  story,
  viewport,
  screenshotOptions = {}
) {
  let name = generateScreenshotName(story, viewport);
  let verbose = process.env.VIZZLY_LOG_LEVEL === 'debug';

  let t0 = Date.now();
  let screenshot = await captureScreenshot(page, screenshotOptions);
  let captureTime = Date.now() - t0;

  let t1 = Date.now();
  await vizzlyScreenshot(name, screenshot, { properties: { url: page.url() } });
  let sendTime = Date.now() - t1;

  if (verbose) {
    console.error(
      `    [screenshot] ${name}: capture=${captureTime}ms send=${sendTime}ms`
    );
  }
}
