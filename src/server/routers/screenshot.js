/**
 * Screenshot Router
 * Handles screenshot uploads and legacy baseline accept
 */

import { parseJsonBody } from '../middleware/json-parser.js';
import { sendJson, sendError } from '../middleware/response.js';

/**
 * Create screenshot router
 * @param {Object} context - Router context
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @param {string|null} context.defaultBuildId - Default build ID
 * @param {Object} context.logger - Logger instance
 * @returns {Function} Route handler
 */
export function createScreenshotRouter({
  screenshotHandler,
  defaultBuildId,
  logger,
}) {
  return async function handleScreenshotRoute(req, res, pathname) {
    if (req.method !== 'POST') {
      return false;
    }

    // Main screenshot upload endpoint
    if (pathname === '/screenshot') {
      try {
        let body = await parseJsonBody(req);
        let { buildId, name, properties, image } = body;

        if (!name || !image) {
          sendError(res, 400, 'name and image are required');
          return true;
        }

        // Use buildId from request body, or fall back to server's buildId
        let effectiveBuildId = buildId || defaultBuildId;

        let result = await screenshotHandler.handleScreenshot(
          effectiveBuildId,
          name,
          image,
          properties
        );

        sendJson(res, result.statusCode, result.body);
        return true;
      } catch (error) {
        logger.error('Screenshot processing error:', error);
        sendError(res, 500, 'Failed to process screenshot');
        return true;
      }
    }

    // Legacy accept-baseline endpoint
    if (pathname === '/accept-baseline') {
      try {
        let body = await parseJsonBody(req);
        let { id } = body;

        if (!id) {
          sendError(res, 400, 'comparison ID is required');
          return true;
        }

        if (screenshotHandler.acceptBaseline) {
          let result = await screenshotHandler.acceptBaseline(id);
          sendJson(res, 200, { success: true, ...result });
        } else {
          sendError(res, 501, 'Accept baseline not implemented');
        }
        return true;
      } catch (error) {
        logger.error('Accept baseline error:', error);
        sendError(res, 500, 'Failed to accept baseline');
        return true;
      }
    }

    return false;
  };
}
