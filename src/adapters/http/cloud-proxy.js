import { createCloudBaselinesRouter } from '../../domains/baselines/cloud-baselines.routes.js';
import { createCloudBuildsRouter } from '../../domains/builds/cloud-builds.routes.js';
import { createCloudProjectsRouter } from '../../domains/projects/cloud-projects.routes.js';
import { sendError, sendServiceUnavailable } from './middleware/response.js';

export function createCloudProxyRouter({ authService }) {
  let projects = createCloudProjectsRouter({ authService });
  let builds = createCloudBuildsRouter({ authService });
  let baselines = createCloudBaselinesRouter({ authService });

  return async function handleCloudProxyRoute(req, res, pathname, parsedUrl) {
    if (!pathname.startsWith('/api/cloud')) return false;

    if (!authService) {
      sendServiceUnavailable(res, 'Auth service');
      return true;
    }

    if (await projects(req, res, pathname)) return true;
    if (await builds(req, res, pathname, parsedUrl)) return true;
    if (await baselines(req, res, pathname)) return true;

    sendError(res, 404, 'Cloud API endpoint not found');
    return true;
  };
}
