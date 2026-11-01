import { parseJsonBody } from '../../server/middleware/json-parser.js';
import {
  sendError,
  sendJson,
  sendServiceUnavailable,
  sendSuccess,
} from '../../server/middleware/response.js';
import * as output from '../../services/output.js';
import {
  buildTokens,
  normalizeDeviceFlowResponse,
} from './auth.normalizers.js';

/**
 * Auth Router
 * Handles authentication endpoints (device flow login, logout, status)
 */

/**
 * Create auth router
 * @param {Object} context - Router context
 * @param {Object} context.authService - Auth service
 * @returns {Function} Route handler
 */
export function createAuthRouter({ authService }) {
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
        output.error('Error getting auth status:', error);
        sendSuccess(res, { authenticated: false, user: null });
        return true;
      }
    }

    // Initiate device flow login
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      try {
        let deviceFlow = await authService.initiateDeviceFlow();
        let flow = normalizeDeviceFlowResponse(deviceFlow);
        sendSuccess(res, {
          deviceCode: flow.deviceCode,
          userCode: flow.userCode,
          verificationUri: flow.verificationUri,
          verificationUriComplete: flow.urlWithCode,
          expiresIn: deviceFlow.expires_in ?? deviceFlow.expiresIn,
          interval: deviceFlow.interval,
        });
        return true;
      } catch (error) {
        output.error('Error initiating device flow:', error);
        sendAuthError(res, error);
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

        let result = await authService.pollDeviceAuthorization(deviceCode);
        if (result.tokens?.accessToken || result.tokens?.access_token) {
          let tokens = buildTokens(result);
          await authService.completeDeviceFlow(tokens);
          sendSuccess(res, { status: 'complete', user: result.user });
        } else if (
          ['pending', 'expired', 'denied', 'invalid'].includes(result.status)
        ) {
          sendSuccess(res, { status: result.status });
        } else {
          throw new Error('Unexpected response from authorization server');
        }
        return true;
      } catch (error) {
        output.error('Error polling device authorization:', error);
        sendAuthError(res, error);
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
        output.error('Error logging out:', error);
        sendAuthError(res, error);
        return true;
      }
    }

    return false;
  };
}

function sendAuthError(res, error) {
  let retryAfter = error.context?.retryAfter;
  if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
  sendJson(res, error.context?.status || 500, {
    error: error.message,
    code: error.context?.serverCode || error.code,
    ...(retryAfter ? { retryAfter } : {}),
  });
}
