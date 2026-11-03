import { parseJsonBody } from '../../adapters/http/middleware/json-parser.js';
import {
  sendError,
  sendSuccess,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';

export function createCloudBaselinesRouter({ projectService }) {
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

      let response = await projectService.getTddBaselines(buildId);
      if (
        Array.isArray(screenshotNames) &&
        Array.isArray(response.screenshots)
      ) {
        response = {
          ...response,
          screenshots: response.screenshots.filter(screenshot =>
            screenshotNames.includes(screenshot.name)
          ),
        };
      }
      sendSuccess(res, {
        success: true,
        message: `Baselines downloaded from build ${buildId}`,
        ...response,
      });
    } catch (error) {
      output.error('Error downloading baselines from cloud:', error);
      sendError(res, error.context?.status || 500, error.message);
    }
    return true;
  };
}
