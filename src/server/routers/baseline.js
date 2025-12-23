/**
 * Baseline Router
 * Handles baseline management (accept, accept-all, reset)
 */

import * as output from '../../utils/output.js';
import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendError,
  sendServiceUnavailable,
  sendSuccess,
} from '../middleware/response.js';

/**
 * Create baseline router
 * @param {Object} context - Router context
 * @param {Object} context.screenshotHandler - Screenshot handler
 * @param {Object} context.tddService - TDD service for baseline downloads
 * @param {Object} context.authService - Auth service for OAuth requests
 * @returns {Function} Route handler
 */
export function createBaselineRouter({
  screenshotHandler,
  tddService,
  authService,
}) {
  return async function handleBaselineRoute(req, res, pathname) {
    // Accept a single screenshot as baseline
    if (req.method === 'POST' && pathname === '/api/baseline/accept') {
      if (!screenshotHandler?.acceptBaseline) {
        sendError(res, 400, 'Baseline management not available');
        return true;
      }

      try {
        const { id } = await parseJsonBody(req);
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
        output.error('Error accepting baseline:', error);
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
        const result = await screenshotHandler.acceptAllBaselines();

        sendSuccess(res, {
          success: true,
          message: `Accepted ${result.count} baselines`,
          count: result.count,
        });
        return true;
      } catch (error) {
        output.error('Error accepting all baselines:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Reject a single comparison (keep current baseline, discard changes)
    if (req.method === 'POST' && pathname === '/api/baseline/reject') {
      if (!screenshotHandler?.rejectBaseline) {
        sendError(res, 400, 'Baseline management not available');
        return true;
      }

      try {
        const { id } = await parseJsonBody(req);
        if (!id) {
          sendError(res, 400, 'Comparison ID required');
          return true;
        }

        await screenshotHandler.rejectBaseline(id);

        sendSuccess(res, {
          success: true,
          message: `Changes rejected for comparison ${id}`,
        });
        return true;
      } catch (error) {
        output.error('Error rejecting baseline:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Delete a comparison entirely (removes from report and deletes files)
    if (req.method === 'POST' && pathname === '/api/baseline/delete') {
      if (!screenshotHandler?.deleteComparison) {
        sendError(res, 400, 'Baseline management not available');
        return true;
      }

      try {
        const { id } = await parseJsonBody(req);
        if (!id) {
          sendError(res, 400, 'Comparison ID required');
          return true;
        }

        await screenshotHandler.deleteComparison(id);

        sendSuccess(res, {
          success: true,
          message: `Comparison ${id} deleted`,
        });
        return true;
      } catch (error) {
        if (error.code === 'NOT_FOUND') {
          sendError(res, 404, error.message);
        } else {
          output.error('Error deleting comparison:', error);
          sendError(res, 500, error.message);
        }
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
        output.error('Error resetting baselines:', error);
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

        // Try OAuth authentication first (allows access to any project user has membership to)
        // This is the preferred method when user is logged in via the dashboard
        if (authService && organizationSlug && projectSlug) {
          try {
            output.info(`Downloading baselines from build ${buildId}...`);
            output.debug(
              'baseline',
              `Using OAuth for ${organizationSlug}/${projectSlug}`
            );

            // Use the CLI endpoint which accepts OAuth and checks project membership
            let apiResponse = await authService.authenticatedRequest(
              `/api/cli/${projectSlug}/builds/${buildId}/tdd-baselines`,
              {
                method: 'GET',
                headers: { 'X-Organization': organizationSlug },
              }
            );

            if (!apiResponse) {
              throw new Error(
                `Build ${buildId} not found or API returned null`
              );
            }

            // Process the baselines through tddService
            let result = await tddService.processDownloadedBaselines(
              apiResponse,
              buildId
            );

            sendSuccess(res, {
              success: true,
              message: `Baselines downloaded from build ${buildId}`,
              ...result,
            });
            return true;
          } catch (oauthError) {
            // If OAuth fails with auth error, fall through to other methods
            if (
              !oauthError.message?.includes('Not authenticated') &&
              !oauthError.message?.includes('401')
            ) {
              throw oauthError;
            }
            output.debug(
              'baseline',
              `OAuth failed, trying other auth methods: ${oauthError.message}`
            );
          }
        }

        // Fall back to using tddService directly (requires VIZZLY_TOKEN env var)
        output.info(`Downloading baselines from build ${buildId}...`);

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
        output.error('Error downloading baselines:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
