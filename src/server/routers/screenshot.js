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
        const { buildId, name, properties, image, type } = body;

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
          properties,
          type
        );

        sendJson(res, result.statusCode, result.body);
        return true;
      } catch (error) {
        output.debug('Screenshot processing error:', {
          error: error.message,
          stack: error.stack,
        });
        sendError(res, 500, `Failed to process screenshot: ${error.message}`);
        return true;
      }
    }

    // Flush endpoint - signals test completion and prints summary
    if (pathname === '/flush') {
      try {
        if (screenshotHandler.getResults) {
          // This triggers printResults() which outputs the summary
          const results = await screenshotHandler.getResults();
          sendJson(res, 200, {
            success: true,
            summary: {
              total: results.total || 0,
              passed: results.passed || 0,
              failed: results.failed || 0,
              new: results.new || 0,
              errors: results.errors || 0,
            },
          });
        } else {
          sendJson(res, 200, { success: true, message: 'No TDD results' });
        }
        return true;
      } catch (error) {
        output.debug('Flush error:', { error: error.message });
        sendError(res, 500, 'Failed to flush');
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
