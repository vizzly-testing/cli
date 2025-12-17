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
  vizzlyScreenshot = null;
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
 * @param {Object} story - Story object
 * @param {Object} viewport - Viewport object
 * @param {Object} screenshotOptions - Screenshot options
 * @returns {Promise<void>}
 */
export async function captureAndSendScreenshot(
  page,
  story,
  viewport,
  screenshotOptions = {},
  sendScreenshot = vizzlyScreenshot
) {
  let name = generateScreenshotName(story, viewport);
  let screenshot = await captureScreenshot(page, screenshotOptions);

  if (!sendScreenshot) return;
  await sendScreenshot(name, screenshot);
}
