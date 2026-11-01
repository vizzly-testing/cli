import {
  sendError,
  sendSuccess,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';

export function createCloudProjectsRouter({ authService }) {
  return async function handleCloudProjectsRoute(req, res, pathname) {
    if (req.method !== 'GET' || pathname !== '/api/cloud/projects')
      return false;

    try {
      let response = await authService.authenticatedRequest(
        '/api/cli/projects',
        {
          method: 'GET',
        }
      );
      sendSuccess(res, { projects: response.projects || [] });
    } catch (error) {
      output.error('Error fetching projects from cloud:', error);
      if (
        error.message?.toLowerCase().includes('not authenticated') ||
        error.code === 'AUTH_ERROR'
      ) {
        sendSuccess(res, { projects: [], authenticated: false });
      } else {
        sendError(res, 500, error.message);
      }
    }
    return true;
  };
}
