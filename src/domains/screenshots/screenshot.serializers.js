import {
  createScreenshotProperties,
  getScreenshotOptionsPayload,
} from './screenshot-options.js';

/**
 * Build payload for screenshot upload or SHA resolution
 * @param {string} name - Screenshot name
 * @param {Buffer|null} buffer - Image data, or null when resolving by SHA
 * @param {Object} metadata - User screenshot properties
 * @param {string|null} sha256 - Pre-computed SHA256 hash (optional)
 * @returns {Object} Screenshot upload payload
 */
export function buildScreenshotPayload(
  name,
  buffer,
  metadata = {},
  sha256 = null,
  screenshotOptions = {}
) {
  let payload = {
    name,
    properties: createScreenshotProperties({ properties: metadata }),
  };

  Object.assign(payload, getScreenshotOptionsPayload(screenshotOptions));

  if (buffer) {
    payload.image_data = buffer.toString('base64');
  }

  if (sha256) {
    payload.sha256 = sha256;
  }

  return payload;
}

/**
 * Build payload for server-side screenshot resolution without sending image bytes
 * @param {string} name - Screenshot name
 * @param {Object} metadata - User screenshot properties
 * @param {string} sha256 - Pre-computed SHA256 hash
 * @returns {Object} Screenshot resolution payload
 */
export function buildScreenshotResolvePayload(
  name,
  metadata = {},
  sha256,
  screenshotOptions = {}
) {
  return buildScreenshotPayload(
    name,
    null,
    metadata,
    sha256,
    screenshotOptions
  );
}

/**
 * Build payload for SHA existence check (signature-based format)
 * @param {Array<Object>} screenshots - Screenshots with sha256 and metadata
 * @param {string} buildId - Build ID for screenshot record creation
 * @returns {Object} SHA check request payload
 */
export function buildShaCheckPayload(screenshots, buildId) {
  // Check if using new signature-based format or legacy SHA-only format
  if (
    screenshots.length > 0 &&
    typeof screenshots[0] === 'object' &&
    screenshots[0].sha256
  ) {
    return {
      buildId,
      screenshots,
    };
  }

  // Legacy format: array of SHA strings
  return {
    shas: screenshots,
    buildId,
  };
}

/**
 * Build screenshot object for SHA checking
 * @param {string} sha256 - SHA256 hash of image
 * @param {string} name - Screenshot name
 * @param {Object} metadata - Screenshot metadata
 * @returns {Object} Screenshot check object
 */
export function buildScreenshotCheckObject(sha256, name, metadata = {}) {
  let meta = metadata || {};
  let properties = createScreenshotProperties({ properties: meta });
  return {
    sha256,
    name,
    properties,
  };
}

/**
 * Build success response object
 * @returns {{ status: number, body: Object }}
 */
export function buildSuccessResponse() {
  return {
    status: 200,
    body: { success: true },
  };
}

/**
 * Build error response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @returns {{ status: number, body: Object }}
 */
export function buildErrorResponse(status, message) {
  return {
    status,
    body: { error: message },
  };
}

/**
 * Build not found response
 * @returns {{ status: number, body: Object }}
 */
export function buildNotFoundResponse() {
  return buildErrorResponse(404, 'Not found');
}

/**
 * Build bad request response
 * @param {string} message - Error message
 * @returns {{ status: number, body: Object }}
 */
export function buildBadRequestResponse(message) {
  return buildErrorResponse(400, message);
}

/**
 * Build internal error response
 * @returns {{ status: number, body: Object }}
 */
export function buildInternalErrorResponse() {
  return buildErrorResponse(500, 'Internal server error');
}
