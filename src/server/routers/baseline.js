/**
 * Baseline Router
 * Handles baseline management (accept, accept-all, reset)
 */

import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendSuccess,
  sendError,
  sendServiceUnavailable,
} from '../middleware/response.js';

/**
 * Create baseline router
 * @param {Object} context - Router context
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @param {Object} context.tddService - TDD service for baseline downloads
 * @param {Object} context.authService - Auth service for OAuth requests
 * @param {Object} context.logger - Logger instance
 * @returns {Function} Route handler
 */
export function createBaselineRouter({
  screenshotHandler,
  tddService,
  authService,
  logger,
}) {
  return async function handleBaselineRoute(req, res, pathname) {
    // Accept a single screenshot as baseline
    if (req.method === 'POST' && pathname === '/api/baseline/accept') {
      if (!screenshotHandler?.acceptBaseline) {
        sendError(res, 400, 'Baseline management not available');
        return true;
      }

      try {
        let { id } = await parseJsonBody(req);
        if (!id) {
          sendError(res, 400, 'Comparison ID required');
          return true;
        }

        await screenshotHandler.acceptBaseline(id);

        sendSuccess(res, {
          success: true,
          message: `Baseline accepted for comparison ${id}`,
        });
        return true;
      } catch (error) {
        logger.error('Error accepting baseline:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Accept all screenshots as baseline
    if (req.method === 'POST' && pathname === '/api/baseline/accept-all') {
      if (!screenshotHandler?.acceptAllBaselines) {
        sendError(res, 400, 'Baseline management not available');
        return true;
      }

      try {
        let result = await screenshotHandler.acceptAllBaselines();

        sendSuccess(res, {
          success: true,
          message: `Accepted ${result.count} baselines`,
          count: result.count,
        });
        return true;
      } catch (error) {
        logger.error('Error accepting all baselines:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Reset baselines to previous state
    if (req.method === 'POST' && pathname === '/api/baseline/reset') {
      if (!screenshotHandler?.resetBaselines) {
        sendError(res, 400, 'Baseline management not available');
        return true;
      }

      try {
        await screenshotHandler.resetBaselines();

        sendSuccess(res, {
          success: true,
          message: 'Baselines reset to previous state',
        });
        return true;
      } catch (error) {
        logger.error('Error resetting baselines:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Download baselines from a remote build
    if (req.method === 'POST' && pathname === '/api/baselines/download') {
      if (!tddService) {
        sendServiceUnavailable(
          res,
          'TDD service not available (only available in TDD mode)'
        );
        return true;
      }

      try {
        let body = await parseJsonBody(req);
        let { buildId, organizationSlug, projectSlug } = body;

        if (!buildId) {
          sendError(res, 400, 'buildId is required');
          return true;
        }

        logger.info(`Downloading baselines from build ${buildId}...`);

        // If organizationSlug and projectSlug are provided, use OAuth-based download
        if (organizationSlug && projectSlug && authService) {
          try {
            let result = await tddService.downloadBaselinesWithAuth(
              buildId,
              organizationSlug,
              projectSlug,
              authService
            );

            sendSuccess(res, {
              success: true,
              message: `Baselines downloaded from build ${buildId}`,
              ...result,
            });
            return true;
          } catch (authError) {
            // Log the OAuth error with details
            logger.warn(
              `OAuth download failed (org=${organizationSlug}, project=${projectSlug}): ${authError.message}`
            );

            // If the error is a 404, it's likely the build doesn't belong to the project
            // or the project/org is incorrect - provide a helpful error
            if (authError.message?.includes('404')) {
              sendError(
                res,
                404,
                `Build not found or does not belong to project "${projectSlug}" in organization "${organizationSlug}". ` +
                  `Please verify the build exists and you have access to it.`
              );
              return true;
            }

            // For auth errors, try API token fallback
            if (!authError.message?.includes('401')) {
              // For other errors, don't fall through - report them directly
              throw authError;
            }
          }
        }

        // Fall back to API token-based download (when no OAuth info or OAuth auth failed)
        let result = await tddService.downloadBaselines(
          'test', // environment
          null, // branch (not needed when buildId is specified)
          buildId, // specific build to download from
          null // comparisonId (not needed)
        );

        sendSuccess(res, {
          success: true,
          message: `Baselines downloaded from build ${buildId}`,
          ...result,
        });
        return true;
      } catch (error) {
        logger.error('Error downloading baselines:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
