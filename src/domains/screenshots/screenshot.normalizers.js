import { getScreenshotOptionsPayload } from './screenshot-options.js';

/**
 * Get effective build ID (falls back to 'default')
 * @param {string|null|undefined} buildId - Build ID from request
 * @returns {string}
 */
export function getEffectiveBuildId(buildId) {
  return buildId || 'default';
}

/**
 * Extract screenshot data from request body
 * @param {Object} body - Request body
 * @returns {{ name: string, image: string, properties?: Object }}
 */
export function extractScreenshotData(body) {
  let screenshotData = {
    name: body.name,
    image: body.image,
    properties: body.properties,
  };

  Object.assign(screenshotData, getScreenshotOptionsPayload(body));

  return screenshotData;
}

/**
 * Build the flat internal comparison shape. Width and height always come from
 * the captured image. The untouched user bag remains available in metadata.
 */
export let extractProperties = (validatedProperties, imageDimensions = {}) => {
  if (!validatedProperties) return {};
  return {
    ...validatedProperties,
    viewport_width: imageDimensions.width ?? null,
    viewport_height: imageDimensions.height ?? null,
    browser: validatedProperties.browser ?? null,
    metadata: validatedProperties,
  };
};
