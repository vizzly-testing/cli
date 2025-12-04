/**
 * Screenshot Router
 * Handles screenshot uploads and legacy baseline accept
 */

import * as output from '../../utils/output.js';
import { parseJsonBody } from '../middleware/json-parser.js';
import { sendError, sendJson } from '../middleware/response.js';

/**
 * Create screenshot router
 * @param {Object} context - Router context
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @param {string|null} context.defaultBuildId - Default build ID
 * @returns {Function} Route handler
 */
export function createScreenshotRouter({ screenshotHandler, defaultBuildId }) {
  return async function handleScreenshotRoute(req, res, pathname) {
    if (req.method !== 'POST') {
      return false;
    }

    // Main screenshot upload endpoint
    if (pathname === '/screenshot') {
      try {
        const body = await parseJsonBody(req);
        const { buildId, name, properties, image } = body;

        if (!name || !image) {
          sendError(res, 400, 'name and image are required');
          return true;
        }

        // Use buildId from request body, or fall back to server's buildId
        const effectiveBuildId = buildId || defaultBuildId;

        const result = await screenshotHandler.handleScreenshot(
          effectiveBuildId,
          name,
          image,
          properties
        );

        sendJson(res, result.statusCode, result.body);
        return true;
      } catch (error) {
        output.debug('Screenshot processing error:', { error: error.message });
        sendError(res, 500, 'Failed to process screenshot');
        return true;
      }
    }

    // Legacy accept-baseline endpoint
    if (pathname === '/accept-baseline') {
      try {
        const body = await parseJsonBody(req);
        const { id } = body;

        if (!id) {
          sendError(res, 400, 'comparison ID is required');
          return true;
        }

        if (screenshotHandler.acceptBaseline) {
          const result = await screenshotHandler.acceptBaseline(id);
          sendJson(res, 200, { success: true, ...result });
        } else {
          sendError(res, 501, 'Accept baseline not implemented');
        }
        return true;
      } catch (error) {
        output.debug('Accept baseline error:', { error: error.message });
        sendError(res, 500, 'Failed to accept baseline');
        return true;
      }
    }

    return false;
  };
}
