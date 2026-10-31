import {
  sendError,
  sendSuccess,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';

export function createCloudBuildsRouter({ authService }) {
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
      let queryParams = new URLSearchParams();
      if (limit) queryParams.append('limit', limit);
      if (branch) queryParams.append('branch', branch);

      let query = queryParams.toString();
      let endpoint = `/api/cli/organizations/${organizationSlug}/projects/${projectSlug}/builds${query ? `?${query}` : ''}`;
      let response = await authService.authenticatedRequest(endpoint, {
        method: 'GET',
      });
      sendSuccess(res, { builds: response.builds || [] });
    } catch (error) {
      output.error('Error fetching builds from cloud:', error);
      sendError(res, 500, error.message);
    }
    return true;
  };
}
