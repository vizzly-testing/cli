/**
 * Screenshot Server Core - Pure functions for screenshot server logic
 *
 * No I/O, no side effects - just data transformations.
 */

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validate screenshot request body
 * @param {Object} body - Request body
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateScreenshotRequest(body) {
  if (!body?.name || !body?.image) {
    return { valid: false, error: 'name and image are required' };
  }
  return { valid: true, error: null };
}

/**
 * Check if request is for the screenshot endpoint
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @returns {boolean}
 */
export function isScreenshotEndpoint(method, url) {
  return method === 'POST' && url === '/screenshot';
}

// ============================================================================
// Build ID Handling
// ============================================================================

/**
 * Get effective build ID (falls back to 'default')
 * @param {string|null|undefined} buildId - Build ID from request
 * @returns {string}
 */
export function getEffectiveBuildId(buildId) {
  return buildId || 'default';
}

// ============================================================================
// Response Building
// ============================================================================

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

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * Build server listen options
 * @param {Object} config - Server configuration
 * @returns {{ port: number, host: string }}
 */
export function buildServerListenOptions(config) {
  return {
    port: config?.server?.port || 3000,
    host: '127.0.0.1',
  };
}

/**
 * Build server started message
 * @param {number} port - Server port
 * @returns {string}
 */
export function buildServerStartedMessage(port) {
  return `Screenshot server listening on http://127.0.0.1:${port}`;
}

/**
 * Build server stopped message
 * @returns {string}
 */
export function buildServerStoppedMessage() {
  return 'Screenshot server stopped';
}

// ============================================================================
// Screenshot Data Extraction
// ============================================================================

/**
 * Extract screenshot data from request body
 * @param {Object} body - Request body
 * @returns {{ name: string, image: string, properties?: Object }}
 */
export function extractScreenshotData(body) {
  return {
    name: body.name,
    image: body.image,
    properties: body.properties,
  };
}
