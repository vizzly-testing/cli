/**
 * Auth Router
 * Handles authentication endpoints (device flow login, logout, status)
 */

import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendSuccess,
  sendError,
  sendServiceUnavailable,
} from '../middleware/response.js';

/**
 * Create auth router
 * @param {Object} context - Router context
 * @param {Object} context.authService - Auth service
 * @param {Object} context.logger - Logger instance
 * @returns {Function} Route handler
 */
export function createAuthRouter({ authService, logger }) {
  return async function handleAuthRoute(req, res, pathname) {
    // Check if auth service is available for all auth routes
    if (pathname.startsWith('/api/auth') && !authService) {
      sendServiceUnavailable(res, 'Auth service');
      return true;
    }

    // Get auth status and user info
    if (req.method === 'GET' && pathname === '/api/auth/status') {
      try {
        let isAuthenticated = await authService.isAuthenticated();
        let user = null;

        if (isAuthenticated) {
          let whoami = await authService.whoami();
          user = whoami.user;
        }

        sendSuccess(res, { authenticated: isAuthenticated, user });
        return true;
      } catch (error) {
        logger.error('Error getting auth status:', error);
        sendSuccess(res, { authenticated: false, user: null });
        return true;
      }
    }

    // Initiate device flow login
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      try {
        let deviceFlow = await authService.initiateDeviceFlow();

        // Transform snake_case to camelCase for frontend
        let response = {
          deviceCode: deviceFlow.device_code,
          userCode: deviceFlow.user_code,
          verificationUri: deviceFlow.verification_uri,
          verificationUriComplete: deviceFlow.verification_uri_complete,
          expiresIn: deviceFlow.expires_in,
          interval: deviceFlow.interval,
        };

        sendSuccess(res, response);
        return true;
      } catch (error) {
        logger.error('Error initiating device flow:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Poll device authorization status
    if (req.method === 'POST' && pathname === '/api/auth/poll') {
      try {
        let body = await parseJsonBody(req);
        let { deviceCode } = body;

        if (!deviceCode) {
          sendError(res, 400, 'deviceCode is required');
          return true;
        }

        let result;
        try {
          result = await authService.pollDeviceAuthorization(deviceCode);
        } catch (error) {
          // Handle "Authorization pending" as a valid response
          if (
            error.message &&
            error.message.includes('Authorization pending')
          ) {
            sendSuccess(res, { status: 'pending' });
            return true;
          }
          throw error;
        }

        // Check if authorization is complete by looking for tokens
        if (result.tokens && result.tokens.accessToken) {
          let tokensData = result.tokens;
          let tokenExpiresIn = tokensData.expiresIn || tokensData.expires_in;
          let tokenExpiresAt = tokenExpiresIn
            ? new Date(Date.now() + tokenExpiresIn * 1000).toISOString()
            : result.expires_at || result.expiresAt;

          let tokens = {
            accessToken: tokensData.accessToken || tokensData.access_token,
            refreshToken: tokensData.refreshToken || tokensData.refresh_token,
            expiresAt: tokenExpiresAt,
            user: result.user,
          };

          await authService.completeDeviceFlow(tokens);

          sendSuccess(res, { status: 'complete', user: result.user });
        } else {
          sendSuccess(res, { status: 'pending' });
        }
        return true;
      } catch (error) {
        logger.error('Error polling device authorization:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    // Logout user
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      try {
        await authService.logout();
        sendSuccess(res, { success: true, message: 'Logged out successfully' });
        return true;
      } catch (error) {
        logger.error('Error logging out:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
