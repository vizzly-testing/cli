import {
  sendError,
  sendSuccess,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';

export function createCloudProjectsRouter({ projectService }) {
  return async function handleCloudProjectsRoute(req, res, pathname) {
    if (req.method !== 'GET' || pathname !== '/api/cloud/projects')
      return false;

    try {
      let projects = await projectService.listProjects();
      if (projects.length === 0 && !(await projectService.hasSavedSession())) {
        sendSuccess(res, { projects, authenticated: false });
      } else {
        sendSuccess(res, { projects });
      }
    } catch (error) {
      output.error('Error fetching projects from cloud:', error);
      sendError(res, error.context?.status || 500, error.message);
    }
    return true;
  };
}
