/**
 * Cloud Proxy Router
 * Proxies requests to Vizzly cloud API with OAuth authentication
 *
 * This router transparently handles OAuth token management:
 * - Reads tokens from ~/.vizzly/config.json via authService
 * - Adds Authorization header to outgoing requests
 * - Handles token refresh on 401 responses
 * - Returns proxied response to React app
 */

import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendSuccess,
  sendError,
  sendServiceUnavailable,
} from '../middleware/response.js';

/**
 * Create cloud proxy router
 * @param {Object} context - Router context
 * @param {Object} context.authService - Auth service for token management
 * @param {Object} context.logger - Logger instance
 * @param {string} context.apiUrl - Base API URL (default: https://app.vizzly.dev)
 * @returns {Function} Route handler
 */
export function createCloudProxyRouter({
  authService,
  logger,
  apiUrl: _apiUrl = 'https://app.vizzly.dev',
}) {
  /**
   * Make an authenticated request to the cloud API
   * @param {string} endpoint - API endpoint (e.g., /api/cli/projects)
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async function proxyRequest(endpoint, options = {}) {
    if (!authService) {
      throw new Error('Auth service not available');
    }

    // Use authService.authenticatedRequest which handles token refresh
    return authService.authenticatedRequest(endpoint, options);
  }

  return async function handleCloudProxyRoute(req, res, pathname, parsedUrl) {
    // Only handle /api/cloud/* routes
    if (!pathname.startsWith('/api/cloud')) {
      return false;
    }

    // Check auth service availability
    if (!authService) {
      sendServiceUnavailable(res, 'Auth service');
      return true;
    }

    // Route: GET /api/cloud/projects - List user's projects
    if (req.method === 'GET' && pathname === '/api/cloud/projects') {
      try {
        let response = await proxyRequest('/api/cli/projects', {
          method: 'GET',
        });
        sendSuccess(res, { projects: response.projects || [] });
        return true;
      } catch (error) {
        logger.error('Error fetching projects from cloud:', error);
        // Return empty array instead of error for better UX when not logged in
        if (
          error.message?.includes('not authenticated') ||
          error.code === 'AUTH_ERROR'
        ) {
          sendSuccess(res, { projects: [], authenticated: false });
        } else {
          sendError(res, 500, error.message);
        }
        return true;
      }
    }

    // Route: GET /api/cloud/organizations/:org/projects/:project/builds
    let buildsMatch = pathname.match(
      /^\/api\/cloud\/organizations\/([^/]+)\/projects\/([^/]+)\/builds$/
    );
    if (req.method === 'GET' && buildsMatch) {
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

        let response = await proxyRequest(endpoint, { method: 'GET' });
        sendSuccess(res, { builds: response.builds || [] });
        return true;
      } catch (error) {
        logger.error('Error fetching builds from cloud:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Route: POST /api/cloud/baselines/download - Download baselines from build
    if (req.method === 'POST' && pathname === '/api/cloud/baselines/download') {
      try {
        let body = await parseJsonBody(req);
        let { buildId, screenshotNames } = body;

        if (!buildId) {
          sendError(res, 400, 'buildId is required');
          return true;
        }

        // Download baselines from the specified build
        let response = await proxyRequest('/api/cli/baselines/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildId, screenshotNames }),
        });

        sendSuccess(res, {
          success: true,
          message: `Baselines downloaded from build ${buildId}`,
          ...response,
        });
        return true;
      } catch (error) {
        logger.error('Error downloading baselines from cloud:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Unknown cloud route
    sendError(res, 404, 'Cloud API endpoint not found');
    return true;
  };
}
