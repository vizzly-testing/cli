import {
  sendError,
  sendSuccess,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';

export function createCloudBuildsRouter({ projectService }) {
  return async function handleCloudBuildsRoute(req, res, pathname, parsedUrl) {
    let buildsMatch = pathname.match(
      /^\/api\/cloud\/organizations\/([^/]+)\/projects\/([^/]+)\/builds$/
    );
    if (req.method !== 'GET' || !buildsMatch) return false;

    try {
      let organizationSlug = decodeURIComponent(buildsMatch[1]);
      let projectSlug = decodeURIComponent(buildsMatch[2]);
      let limit = parsedUrl.searchParams.get('limit') || '20';
      let branch = parsedUrl.searchParams.get('branch');
      let builds = await projectService.getRecentBuilds(
        projectSlug,
        organizationSlug,
        { limit: Number(limit), branch: branch || undefined }
      );
      sendSuccess(res, { builds });
    } catch (error) {
      output.error('Error fetching builds from cloud:', error);
      sendError(res, error.context?.status || 500, error.message);
    }
    return true;
  };
}
