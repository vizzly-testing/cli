/**
 * Response Helpers
 * Standardized response utilities for consistent API responses
 */

/**
 * Send JSON response
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {Object} data
 */
export function sendJson(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

/**
 * Send success response
 * @param {http.ServerResponse} res
 * @param {Object} data
 */
export function sendSuccess(res, data = {}) {
  sendJson(res, 200, data);
}

/**
 * Send error response
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {string} message
 */
export function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

/**
 * Send 404 Not Found
 * @param {http.ServerResponse} res
 * @param {string} message
 */
export function sendNotFound(res, message = 'Not found') {
  sendError(res, 404, message);
}

/**
 * Send 503 Service Unavailable
 * @param {http.ServerResponse} res
 * @param {string} serviceName
 */
export function sendServiceUnavailable(res, serviceName) {
  sendError(res, 503, `${serviceName} not available`);
}

/**
 * Send HTML response
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {string} html
 */
export function sendHtml(res, statusCode, html) {
  res.setHeader('Content-Type', 'text/html');
  res.statusCode = statusCode;
  res.end(html);
}

/**
 * Send file response with specified content type
 * @param {http.ServerResponse} res
 * @param {Buffer|string} content
 * @param {string} contentType
 */
export function sendFile(res, content, contentType) {
  res.setHeader('Content-Type', contentType);
  res.statusCode = 200;
  res.end(content);
}
