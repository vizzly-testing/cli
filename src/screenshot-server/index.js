/**
 * Screenshot Server Module
 *
 * Exports pure functions (core) and I/O operations for screenshot server functionality.
 */

// Core - pure functions
export {
  buildBadRequestResponse,
  buildErrorResponse,
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

// Operations - I/O with dependency injection
export {
  handleRequest,
  parseRequestBody,
  startServer,
  stopServer,
} from './operations.js';
