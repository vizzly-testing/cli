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

/**
 * Create config router
 * @param {Object} context - Router context
 * @param {Object} context.configService - Config service
 * @param {Object} context.logger - Logger instance
 * @returns {Function} Route handler
 */
export function createConfigRouter({ configService, logger }) {
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
        logger.error('Error fetching config:', error);
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
        logger.error('Error fetching project config:', error);
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
        logger.error('Error fetching global config:', error);
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
        logger.error('Error updating project config:', error);
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
        logger.error('Error updating global config:', error);
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
        logger.error('Error validating config:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
