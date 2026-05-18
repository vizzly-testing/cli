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

function sendBaselineUnavailable(res) {
  sendError(res, 400, 'Baseline management not available');
}

async function parseRequiredComparisonId(req, res) {
  let { id } = await parseJsonBody(req);
  if (!id) {
    sendError(res, 400, 'Comparison ID required');
    return null;
  }

  return id;
}

async function handleComparisonAction({
  req,
  res,
  screenshotHandler,
  actionName,
  action,
  successMessage,
}) {
  if (!screenshotHandler?.[actionName]) {
    sendBaselineUnavailable(res);
    return true;
  }

  try {
    let id = await parseRequiredComparisonId(req, res);
    if (!id) {
      return true;
    }

    await screenshotHandler[actionName](id);

    sendSuccess(res, {
      success: true,
      message: successMessage(id),
    });
    return true;
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      sendError(res, 404, error.message);
    } else {
      output.error(`Error ${action}:`, error);
      sendError(res, 500, error.message);
    }
    return true;
  }
}

async function handleAcceptAllBaselines(res, screenshotHandler) {
  if (!screenshotHandler?.acceptAllBaselines) {
    sendBaselineUnavailable(res);
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
    output.error('Error accepting all baselines:', error);
    sendError(res, 500, error.message);
    return true;
  }
}

async function handleResetBaselines(res, screenshotHandler) {
  if (!screenshotHandler?.resetBaselines) {
    sendBaselineUnavailable(res);
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

function shouldFallbackFromOAuth(error) {
  return (
    error.message?.includes('Not authenticated') ||
    error.message?.includes('401')
  );
}

async function downloadBaselinesWithOAuth({
  authService,
  tddService,
  buildId,
  organizationSlug,
  projectSlug,
}) {
  output.info(`Downloading baselines from build ${buildId}...`);
  output.debug(
    'baseline',
    `Using OAuth for ${organizationSlug}/${projectSlug}`
  );

  let apiResponse = await authService.authenticatedRequest(
    `/api/cli/${projectSlug}/builds/${buildId}/tdd-baselines`,
    {
      method: 'GET',
      headers: { 'X-Organization': organizationSlug },
    }
  );

  if (!apiResponse) {
    throw new Error(`Build ${buildId} not found or API returned null`);
  }

  return tddService.processDownloadedBaselines(apiResponse, buildId);
}

async function downloadBaselinesWithToken(tddService, buildId) {
  output.info(`Downloading baselines from build ${buildId}...`);

  return tddService.downloadBaselines('test', null, buildId, null);
}

async function handleBaselineDownload({ req, res, tddService, authService }) {
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

    let result;

    if (authService && organizationSlug && projectSlug) {
      try {
        result = await downloadBaselinesWithOAuth({
          authService,
          tddService,
          buildId,
          organizationSlug,
          projectSlug,
        });
      } catch (oauthError) {
        if (!shouldFallbackFromOAuth(oauthError)) {
          throw oauthError;
        }
        output.debug(
          'baseline',
          `OAuth failed, trying other auth methods: ${oauthError.message}`
        );
      }
    }

    if (!result) {
      result = await downloadBaselinesWithToken(tddService, buildId);
    }

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
      return handleComparisonAction({
        req,
        res,
        screenshotHandler,
        actionName: 'acceptBaseline',
        action: 'accepting baseline',
        successMessage: id => `Baseline accepted for comparison ${id}`,
      });
    }

    // Accept all screenshots as baseline
    if (req.method === 'POST' && pathname === '/api/baseline/accept-all') {
      return handleAcceptAllBaselines(res, screenshotHandler);
    }

    // Reject a single comparison (keep current baseline, discard changes)
    if (req.method === 'POST' && pathname === '/api/baseline/reject') {
      return handleComparisonAction({
        req,
        res,
        screenshotHandler,
        actionName: 'rejectBaseline',
        action: 'rejecting baseline',
        successMessage: id => `Changes rejected for comparison ${id}`,
      });
    }

    // Delete a comparison entirely (removes from report and deletes files)
    if (req.method === 'POST' && pathname === '/api/baseline/delete') {
      return handleComparisonAction({
        req,
        res,
        screenshotHandler,
        actionName: 'deleteComparison',
        action: 'deleting comparison',
        successMessage: id => `Comparison ${id} deleted`,
      });
    }

    // Reset baselines to previous state
    if (req.method === 'POST' && pathname === '/api/baseline/reset') {
      return handleResetBaselines(res, screenshotHandler);
    }

    // Download baselines from a remote build
    if (req.method === 'POST' && pathname === '/api/baselines/download') {
      return handleBaselineDownload({
        req,
        res,
        tddService,
        authService,
      });
    }

    return false;
  };
}
