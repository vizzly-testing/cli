/**
 * Screenshot option names that are part of the SDK/config contract, not the
 * user's arbitrary metadata bag.
 */
export let RESERVED_PROPERTY_OPTIONS = Object.freeze({
  threshold: {
    message:
      'Move "threshold" out of properties; properties is only for user metadata.',
  },
  minClusterSize: {
    message:
      'Move "minClusterSize" out of properties; properties is only for user metadata.',
  },
  min_cluster_size: {
    message:
      'Move "min_cluster_size" out of properties; properties is only for user metadata.',
  },
  fullPage: {
    message:
      'Move "fullPage" out of properties; properties is only for user metadata.',
  },
  full_page: {
    message:
      'Move "full_page" out of properties; properties is only for user metadata.',
  },
  captureMode: {
    message:
      'Move "captureMode" out of properties; properties is only for user metadata.',
  },
  capture_mode: {
    message:
      'Move "capture_mode" out of properties; properties is only for user metadata.',
  },
  deviceScaleFactor: {
    message:
      'Move "deviceScaleFactor" out of properties; properties is only for user metadata.',
  },
  device_scale_factor: {
    message:
      'Move "device_scale_factor" out of properties; properties is only for user metadata.',
  },
  pixelRatio: {
    message:
      'Move "pixelRatio" out of properties; properties is only for user metadata.',
  },
  dpr: {
    message:
      'Move "dpr" out of properties; properties is only for user metadata.',
  },
  selector: {
    message:
      'Move "selector" out of properties; properties is only for user metadata.',
  },
  component: {
    message:
      'Move "component" out of properties; properties is only for user metadata.',
  },
  elementSelector: {
    message:
      'Move "elementSelector" out of properties; properties is only for user metadata.',
  },
  element_selector: {
    message:
      'Move "element_selector" out of properties; properties is only for user metadata.',
  },
  buildId: {
    message:
      'Move "buildId" out of properties; properties is only for user metadata.',
  },
  build_id: {
    message:
      'Move "build_id" out of properties; properties is only for user metadata.',
  },
  requestTimeout: {
    message:
      'Move "requestTimeout" out of properties; properties is only for user metadata.',
  },
  request_timeout: {
    message:
      'Move "request_timeout" out of properties; properties is only for user metadata.',
  },
});

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

function createReservedPropertyWarning(option) {
  return {
    code: 'reserved-property-option',
    option,
    message: RESERVED_PROPERTY_OPTIONS[option].message,
  };
}

/**
 * Normalize screenshot SDK options into the local and cloud upload payload.
 * Reserved names found inside properties are discarded instead of being promoted
 * into options.
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

  let warnings = [];
  let normalizedProperties = {};
  let sourceProperties =
    properties && typeof properties === 'object' && !Array.isArray(properties)
      ? properties
      : {};

  for (let [key, value] of Object.entries(sourceProperties)) {
    if (RESERVED_PROPERTY_OPTIONS[key]) {
      warnings.push(createReservedPropertyWarning(key));
      continue;
    }

    normalizedProperties[key] = value;
  }

  return {
    buildId,
    requestTimeout,
    threshold,
    minClusterSize,
    fullPage,
    captureMode,
    deviceScaleFactor,
    selector,
    properties: normalizedProperties,
    warnings,
  };
}

export function createScreenshotProperties(options = {}) {
  return normalizeScreenshotOptions(options).properties;
}
