/**
 * Config Router
 * Handles configuration management endpoints
 */

import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendSuccess,
  sendError,
  sendServiceUnavailable,
} from '../middleware/response.js';
import * as output from '../../utils/output.js';

/**
 * Create config router
 * @param {Object} context - Router context
 * @param {Object} context.configService - Config service
 * @returns {Function} Route handler
 */
export function createConfigRouter({ configService }) {
  return async function handleConfigRoute(req, res, pathname) {
    // Check if config service is available for all config routes
    if (pathname.startsWith('/api/config') && !configService) {
      sendServiceUnavailable(res, 'Config service');
      return true;
    }

    // Get merged config with sources
    if (req.method === 'GET' && pathname === '/api/config') {
      try {
        let configData = await configService.getConfig('merged');
        sendSuccess(res, configData);
        return true;
      } catch (error) {
        output.debug('Error fetching config:', { error: error.message });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Get project-level config
    if (req.method === 'GET' && pathname === '/api/config/project') {
      try {
        let configData = await configService.getConfig('project');
        sendSuccess(res, configData);
        return true;
      } catch (error) {
        output.debug('Error fetching project config:', {
          error: error.message,
        });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Get global config
    if (req.method === 'GET' && pathname === '/api/config/global') {
      try {
        let configData = await configService.getConfig('global');
        sendSuccess(res, configData);
        return true;
      } catch (error) {
        output.debug('Error fetching global config:', { error: error.message });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Update project config
    if (req.method === 'POST' && pathname === '/api/config/project') {
      try {
        let body = await parseJsonBody(req);
        let result = await configService.updateConfig('project', body);
        sendSuccess(res, { success: true, ...result });
        return true;
      } catch (error) {
        output.debug('Error updating project config:', {
          error: error.message,
        });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Update global config
    if (req.method === 'POST' && pathname === '/api/config/global') {
      try {
        let body = await parseJsonBody(req);
        let result = await configService.updateConfig('global', body);
        sendSuccess(res, { success: true, ...result });
        return true;
      } catch (error) {
        output.debug('Error updating global config:', { error: error.message });
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Validate config
    if (req.method === 'POST' && pathname === '/api/config/validate') {
      try {
        let body = await parseJsonBody(req);
        let result = await configService.validateConfig(body);
        sendSuccess(res, result);
        return true;
      } catch (error) {
        output.debug('Error validating config:', { error: error.message });
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
