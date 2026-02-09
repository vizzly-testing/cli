/**
 * Projects Router
 * Handles project listing and builds endpoints
 */

import * as output from '../../utils/output.js';
import {
  sendError,
  sendServiceUnavailable,
  sendSuccess,
} from '../middleware/response.js';

/**
 * Create projects router
 * @param {Object} context - Router context
 * @param {Object} context.projectService - Project service
 * @returns {Function} Route handler
 */
export function createProjectsRouter({ projectService }) {
  return async function handleProjectsRoute(req, res, pathname, parsedUrl) {
    // Check if project service is available for all project routes
    if (pathname.startsWith('/api/projects') && !projectService) {
      sendServiceUnavailable(res, 'Project service');
      return true;
    }

    // List all projects from API
    if (req.method === 'GET' && pathname === '/api/projects') {
      try {
        const projects = await projectService.listProjects();
        sendSuccess(res, { projects });
        return true;
      } catch (error) {
        output.debug('Error listing projects:', { error: error.message });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Get builds for a specific project (used by /builds page)
    const projectBuildsMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/([^/]+)\/builds$/
    );
    if (req.method === 'GET' && projectBuildsMatch) {
      try {
        const organizationSlug = decodeURIComponent(projectBuildsMatch[1]);
        const projectSlug = decodeURIComponent(projectBuildsMatch[2]);

        const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
        const branch = parsedUrl.searchParams.get('branch') || undefined;

        const builds = await projectService.getRecentBuilds(
          projectSlug,
          organizationSlug,
          { limit, branch }
        );

        sendSuccess(res, { builds });
        return true;
      } catch (error) {
        output.debug('Error fetching project builds:', {
          error: error.message,
        });
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
