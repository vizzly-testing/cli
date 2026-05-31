/**
 * Normalize screenshot SDK options into the properties payload consumed by the
 * local TDD server and cloud-compatible comparison path.
 */
export function createScreenshotProperties(options = {}) {
  let {
    buildId: _buildId,
    properties = {},
    requestTimeout: _requestTimeout,
    threshold,
    minClusterSize,
    fullPage,
    ...topLevelProperties
  } = options;

  let normalizedProperties = {
    ...properties,
    ...topLevelProperties,
  };

  if (threshold !== undefined) {
    normalizedProperties.threshold = threshold;
  }

  if (minClusterSize !== undefined) {
    normalizedProperties.minClusterSize = minClusterSize;
  }

  if (fullPage !== undefined) {
    normalizedProperties.fullPage = fullPage;
  }

  return normalizedProperties;
}
