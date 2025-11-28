/**
 * Projects Router
 * Handles project management and builds endpoints
 */

import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendSuccess,
  sendError,
  sendServiceUnavailable,
} from '../middleware/response.js';

/**
 * Create projects router
 * @param {Object} context - Router context
 * @param {Object} context.projectService - Project service
 * @param {Object} context.logger - Logger instance
 * @returns {Function} Route handler
 */
export function createProjectsRouter({ projectService, logger }) {
  return async function handleProjectsRoute(req, res, pathname, parsedUrl) {
    // Check if project service is available for all project routes
    if (pathname.startsWith('/api/projects') && !projectService) {
      sendServiceUnavailable(res, 'Project service');
      return true;
    }

    // List all projects from API
    if (req.method === 'GET' && pathname === '/api/projects') {
      try {
        let projects = await projectService.listProjects();
        sendSuccess(res, { projects });
        return true;
      } catch (error) {
        logger.error('Error listing projects:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // List project directory mappings
    if (req.method === 'GET' && pathname === '/api/projects/mappings') {
      try {
        let mappings = await projectService.listMappings();
        sendSuccess(res, { mappings });
        return true;
      } catch (error) {
        logger.error('Error listing project mappings:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Create or update project mapping
    if (req.method === 'POST' && pathname === '/api/projects/mappings') {
      try {
        let body = await parseJsonBody(req);
        let { directory, projectSlug, organizationSlug, token, projectName } =
          body;

        let mapping = await projectService.createMapping(directory, {
          projectSlug,
          organizationSlug,
          token,
          projectName,
        });

        sendSuccess(res, { success: true, mapping });
        return true;
      } catch (error) {
        logger.error('Error creating project mapping:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Delete project mapping
    if (
      req.method === 'DELETE' &&
      pathname.startsWith('/api/projects/mappings/')
    ) {
      try {
        let directory = decodeURIComponent(
          pathname.replace('/api/projects/mappings/', '')
        );
        await projectService.removeMapping(directory);
        sendSuccess(res, { success: true, message: 'Mapping deleted' });
        return true;
      } catch (error) {
        logger.error('Error deleting project mapping:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Get recent builds for current project
    if (req.method === 'GET' && pathname === '/api/builds/recent') {
      if (!projectService) {
        sendServiceUnavailable(res, 'Project service');
        return true;
      }

      try {
        let currentDir = process.cwd();
        let mapping = await projectService.getMapping(currentDir);

        if (!mapping || !mapping.projectSlug || !mapping.organizationSlug) {
          sendError(res, 400, 'No project configured for this directory');
          return true;
        }

        let limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);
        let branch = parsedUrl.searchParams.get('branch') || undefined;

        let builds = await projectService.getRecentBuilds(
          mapping.projectSlug,
          mapping.organizationSlug,
          { limit, branch }
        );

        sendSuccess(res, { builds });
        return true;
      } catch (error) {
        logger.error('Error fetching recent builds:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Get builds for a specific project (used by /builds page)
    let projectBuildsMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/([^/]+)\/builds$/
    );
    if (req.method === 'GET' && projectBuildsMatch) {
      try {
        let organizationSlug = decodeURIComponent(projectBuildsMatch[1]);
        let projectSlug = decodeURIComponent(projectBuildsMatch[2]);

        let limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
        let branch = parsedUrl.searchParams.get('branch') || undefined;

        let builds = await projectService.getRecentBuilds(
          projectSlug,
          organizationSlug,
          { limit, branch }
        );

        sendSuccess(res, { builds });
        return true;
      } catch (error) {
        logger.error('Error fetching project builds:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
