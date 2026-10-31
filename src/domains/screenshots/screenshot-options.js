export let SCREENSHOT_OPTION_NAMES = Object.freeze([
  'threshold',
  'minClusterSize',
  'fullPage',
  'captureMode',
  'deviceScaleFactor',
  'selector',
]);

export function getScreenshotOptionsPayload(options = {}) {
  return Object.fromEntries(
    SCREENSHOT_OPTION_NAMES.filter(option => options[option] !== undefined).map(
      option => [option, options[option]]
    )
  );
}

/**
 * Keep user properties separate from the Vizzly options sent beside them.
 */
export function normalizeScreenshotOptions(options = {}) {
  let {
    buildId,
    properties = {},
    requestTimeout,
    threshold,
    minClusterSize,
    fullPage,
    captureMode,
    deviceScaleFactor,
    selector,
  } = options;

  let sourceProperties =
    properties && typeof properties === 'object' && !Array.isArray(properties)
      ? properties
      : {};

  return {
    buildId,
    requestTimeout,
    threshold,
    minClusterSize,
    fullPage,
    captureMode,
    deviceScaleFactor,
    selector,
    properties: { ...sourceProperties },
  };
}

export function createScreenshotProperties(options = {}) {
  return normalizeScreenshotOptions(options).properties;
}
