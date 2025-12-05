/**
 * Projects Router
 * Handles project management and builds endpoints
 */

import * as output from '../../utils/output.js';
import { parseJsonBody } from '../middleware/json-parser.js';
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

    // List project directory mappings
    if (req.method === 'GET' && pathname === '/api/projects/mappings') {
      try {
        const mappings = await projectService.listMappings();
        sendSuccess(res, { mappings });
        return true;
      } catch (error) {
        output.debug('Error listing project mappings:', {
          error: error.message,
        });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Create or update project mapping
    if (req.method === 'POST' && pathname === '/api/projects/mappings') {
      try {
        const body = await parseJsonBody(req);
        const { directory, projectSlug, organizationSlug, token, projectName } =
          body;

        const mapping = await projectService.createMapping(directory, {
          projectSlug,
          organizationSlug,
          token,
          projectName,
        });

        sendSuccess(res, { success: true, mapping });
        return true;
      } catch (error) {
        output.debug('Error creating project mapping:', {
          error: error.message,
        });
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
        const directory = decodeURIComponent(
          pathname.replace('/api/projects/mappings/', '')
        );
        await projectService.removeMapping(directory);
        sendSuccess(res, { success: true, message: 'Mapping deleted' });
        return true;
      } catch (error) {
        output.debug('Error deleting project mapping:', {
          error: error.message,
        });
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
        const currentDir = process.cwd();
        const mapping = await projectService.getMapping(currentDir);

        if (!mapping || !mapping.projectSlug || !mapping.organizationSlug) {
          sendError(res, 400, 'No project configured for this directory');
          return true;
        }

        const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);
        const branch = parsedUrl.searchParams.get('branch') || undefined;

        const builds = await projectService.getRecentBuilds(
          mapping.projectSlug,
          mapping.organizationSlug,
          { limit, branch }
        );

        sendSuccess(res, { builds });
        return true;
      } catch (error) {
        output.debug('Error fetching recent builds:', { error: error.message });
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
