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
  fullPage: {
    message:
      'Move "fullPage" out of properties; properties is only for user metadata.',
  },
  buildId: {
    message:
      'Move "buildId" out of properties; properties is only for user metadata.',
  },
  requestTimeout: {
    message:
      'Move "requestTimeout" out of properties; properties is only for user metadata.',
  },
});

function createReservedPropertyWarning(option) {
  return {
    code: 'reserved-property-option',
    option,
    message: RESERVED_PROPERTY_OPTIONS[option].message,
  };
}

/**
 * Normalize screenshot SDK options into the properties payload consumed by the
 * local TDD server and cloud-compatible comparison path.
 */
export function normalizeScreenshotOptions(options = {}) {
  let {
    buildId,
    properties = {},
    requestTimeout,
    threshold,
    minClusterSize,
    fullPage,
  } = options;

  let warnings = [];
  let normalizedProperties = {};

  for (let [key, value] of Object.entries(properties || {})) {
    if (RESERVED_PROPERTY_OPTIONS[key]) {
      warnings.push(createReservedPropertyWarning(key));

      if (key === 'threshold' && threshold === undefined) threshold = value;
      if (key === 'minClusterSize' && minClusterSize === undefined) {
        minClusterSize = value;
      }
      if (key === 'fullPage' && fullPage === undefined) fullPage = value;
      if (key === 'buildId' && buildId === undefined) buildId = value;
      if (key === 'requestTimeout' && requestTimeout === undefined) {
        requestTimeout = value;
      }

      continue;
    }

    normalizedProperties[key] = value;
  }

  if (threshold !== undefined) {
    normalizedProperties.threshold = threshold;
  }

  if (minClusterSize !== undefined) {
    normalizedProperties.minClusterSize = minClusterSize;
  }

  if (fullPage !== undefined) {
    normalizedProperties.fullPage = fullPage;
  }

  return {
    buildId,
    requestTimeout,
    properties: normalizedProperties,
    warnings,
  };
}

export function createScreenshotProperties(options = {}) {
  return normalizeScreenshotOptions(options).properties;
}
