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
        let organizationSlug = decodeURIComponent(projectBuildsMatch[1]);
        let projectSlug = decodeURIComponent(projectBuildsMatch[2]);
        let limit = parseLimitParam(parsedUrl.searchParams.get('limit'));

        if (limit === null) {
          sendError(res, 400, 'limit must be a positive integer');
          return true;
        }

        let branch = parsedUrl.searchParams.get('branch') || undefined;

        let builds = await projectService.getRecentBuilds(
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

function parseLimitParam(value) {
  if (value === null) return 20;
  if (!/^[1-9]\d*$/.test(value)) return null;
  return Number(value);
}
