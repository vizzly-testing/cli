import { parseJsonBody } from '../../adapters/http/middleware/json-parser.js';
import {
  sendError,
  sendSuccess,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';

export function createCloudBaselinesRouter({ authService }) {
  return async function handleCloudBaselinesRoute(req, res, pathname) {
    if (req.method !== 'POST' || pathname !== '/api/cloud/baselines/download') {
      return false;
    }

    try {
      let body = await parseJsonBody(req);
      let { buildId, screenshotNames } = body;
      if (!buildId) {
        sendError(res, 400, 'buildId is required');
        return true;
      }

      let response = await authService.authenticatedRequest(
        '/api/cli/baselines/download',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildId, screenshotNames }),
        }
      );
      sendSuccess(res, {
        success: true,
        message: `Baselines downloaded from build ${buildId}`,
        ...response,
      });
    } catch (error) {
      output.error('Error downloading baselines from cloud:', error);
      sendError(res, 500, error.message);
    }
    return true;
  };
}
