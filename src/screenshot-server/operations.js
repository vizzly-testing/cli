/**
 * Screenshot Server Operations - I/O operations with dependency injection
 *
 * Each operation takes its dependencies as parameters for testability.
 */

import {
  buildBadRequestResponse,
  buildInternalErrorResponse,
  buildNotFoundResponse,
  buildServerListenOptions,
  buildServerStartedMessage,
  buildServerStoppedMessage,
  buildSuccessResponse,
  extractScreenshotData,
  getEffectiveBuildId,
  isScreenshotEndpoint,
  validateScreenshotRequest,
} from './core.js';

// ============================================================================
// Request Body Parsing
// ============================================================================

/**
 * Parse request body as JSON
 * @param {Object} options - Options
 * @param {Object} options.req - HTTP request
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.createError - Error factory
 * @returns {Promise<Object>} Parsed body
 */
export function parseRequestBody({ req, deps }) {
  let { createError } = deps;

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(createError('Invalid JSON in request body', 'INVALID_JSON'));
      }
    });
    req.on('error', error => {
      reject(createError(`Request error: ${error.message}`, 'REQUEST_ERROR'));
    });
  });
}

// ============================================================================
// Request Handling
// ============================================================================

/**
 * Handle incoming HTTP request
 * @param {Object} options - Options
 * @param {Object} options.req - HTTP request
 * @param {Object} options.res - HTTP response
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.buildManager - Build manager for screenshot storage
 * @param {Function} options.deps.createError - Error factory
 * @param {Object} options.deps.output - Output utilities
 */
export async function handleRequest({ req, res, deps }) {
  let { buildManager, createError, output } = deps;

  // Check if this is a screenshot endpoint
  if (!isScreenshotEndpoint(req.method, req.url)) {
    let response = buildNotFoundResponse();
    sendResponse(res, response);
    return;
  }

  try {
    // Parse request body
    let body = await parseRequestBody({ req, deps: { createError } });

    // Validate required fields
    let validation = validateScreenshotRequest(body);
    if (!validation.valid) {
      let response = buildBadRequestResponse(validation.error);
      sendResponse(res, response);
      return;
    }

    // Process screenshot
    let effectiveBuildId = getEffectiveBuildId(body.buildId);
    let screenshotData = extractScreenshotData(body);

    await buildManager.addScreenshot(effectiveBuildId, screenshotData);

    let response = buildSuccessResponse();
    sendResponse(res, response);
  } catch (error) {
    output.error('Failed to process screenshot:', error);
    let response = buildInternalErrorResponse();
    sendResponse(res, response);
  }
}

/**
 * Send response to client
 * @param {Object} res - HTTP response
 * @param {{ status: number, body: Object }} response - Response data
 */
function sendResponse(res, response) {
  res.statusCode = response.status;
  res.end(JSON.stringify(response.body));
}

// ============================================================================
// Server Lifecycle
// ============================================================================

/**
 * Start the HTTP server
 * @param {Object} options - Options
 * @param {Object} options.config - Server configuration
 * @param {Function} options.requestHandler - Request handler function
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.createHttpServer - HTTP server factory (http.createServer)
 * @param {Function} options.deps.createError - Error factory
 * @param {Object} options.deps.output - Output utilities
 * @returns {Promise<Object>} HTTP server instance
 */
export function startServer({ config, requestHandler, deps }) {
  let { createHttpServer, createError, output } = deps;

  return new Promise((resolve, reject) => {
    let server = createHttpServer(requestHandler);
    let { port, host } = buildServerListenOptions(config);

    server.listen(port, host, error => {
      if (error) {
        reject(
          createError(
            `Failed to start screenshot server: ${error.message}`,
            'SERVER_ERROR'
          )
        );
      } else {
        output.info(buildServerStartedMessage(port));
        resolve(server);
      }
    });
  });
}

/**
 * Stop the HTTP server
 * @param {Object} options - Options
 * @param {Object|null} options.server - HTTP server instance
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.output - Output utilities
 * @returns {Promise<void>}
 */
export function stopServer({ server, deps }) {
  let { output } = deps;

  if (!server) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    server.close(() => {
      output.info(buildServerStoppedMessage());
      resolve();
    });
  });
}
