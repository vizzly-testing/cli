/**
 * Tests for AuthService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '../../src/services/auth-service.js';
import { AuthError, VizzlyError } from '../../src/errors/vizzly-error.js';
import * as globalConfig from '../../src/utils/global-config.js';

// Mock global-config module
vi.mock('../../src/utils/global-config.js', () => ({
  saveAuthTokens: vi.fn(),
  clearAuthTokens: vi.fn(),
  getAuthTokens: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('AuthService', () => {
  let authService;
  let mockFetch;

  beforeEach(() => {
    authService = new AuthService({ baseUrl: 'https://test.vizzly.dev' });
    mockFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default base URL', () => {
      let service = new AuthService();
      expect(service.baseUrl).toBe('https://app.vizzly.dev');
    });

    it('should create instance with custom base URL', () => {
      let service = new AuthService({ baseUrl: 'https://custom.vizzly.dev' });
      expect(service.baseUrl).toBe('https://custom.vizzly.dev');
    });

    it('should set user agent', () => {
      let service = new AuthService();
      expect(service.userAgent).toContain('vizzly-cli');
      expect(service.userAgent).toContain('auth');
    });
  });

  describe('request', () => {
    it('should make successful unauthenticated request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      let result = await authService.request('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('vizzly-cli'),
          }),
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw AuthError on 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await expect(authService.request('/api/test')).rejects.toThrow(AuthError);
    });

    it('should throw VizzlyError on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({ error: 'Too many requests' }),
      });

      await expect(authService.request('/api/test')).rejects.toThrow(
        'Too many login attempts'
      );
    });

    it('should throw VizzlyError on other error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({ error: 'Server error' }),
      });

      await expect(authService.request('/api/test')).rejects.toThrow(
        VizzlyError
      );
    });
  });

  describe('authenticatedRequest', () => {
    it('should make successful authenticated request', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce({
        accessToken: 'test_access_token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: 'protected' }),
      });

      let result = await authService.authenticatedRequest('/api/protected');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test_access_token',
          }),
        })
      );
      expect(result).toEqual({ data: 'protected' });
    });

    it('should throw AuthError when no tokens exist', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce(null);

      await expect(
        authService.authenticatedRequest('/api/protected')
      ).rejects.toThrow('No authentication token found');
    });

    it('should throw AuthError on 401 response', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce({
        accessToken: 'expired_token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({ error: 'Token expired' }),
      });

      await expect(
        authService.authenticatedRequest('/api/protected')
      ).rejects.toThrow('Authentication token is invalid or expired');
    });
  });

  describe('initiateDeviceFlow', () => {
    it('should initiate device flow successfully', async () => {
      let mockResponse = {
        deviceCode: 'device_123',
        userCode: 'ABCD-EFGH',
        verificationUrl: 'https://vizzly.dev/activate',
        expiresIn: 600,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      let result = await authService.initiateDeviceFlow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/auth/cli/device/initiate',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('pollDeviceAuthorization', () => {
    it('should poll for authorization successfully', async () => {
      let mockResponse = {
        status: 'pending',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      let result = await authService.pollDeviceAuthorization('device_123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/auth/cli/device/poll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ device_code: 'device_123' }),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('completeDeviceFlow', () => {
    it('should save tokens on successful completion', async () => {
      let tokenData = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        expiresAt: '2025-12-31T23:59:59Z',
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      };

      await authService.completeDeviceFlow(tokenData);

      expect(globalConfig.saveAuthTokens).toHaveBeenCalledWith(tokenData);
    });
  });

  describe('refresh', () => {
    it('should refresh access token successfully', async () => {
      let existingAuth = {
        refreshToken: 'refresh_token_456',
        user: {
          id: 'user_123',
          name: 'Test User',
        },
      };

      let newTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: '2025-12-31T23:59:59Z',
      };

      globalConfig.getAuthTokens.mockResolvedValueOnce(existingAuth);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => newTokens,
      });

      let result = await authService.refresh();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/auth/cli/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'refresh_token_456' }),
        })
      );

      expect(globalConfig.saveAuthTokens).toHaveBeenCalledWith({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: '2025-12-31T23:59:59Z',
        user: existingAuth.user,
      });

      expect(result).toEqual(newTokens);
    });

    it('should throw AuthError when no refresh token exists', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce(null);

      await expect(authService.refresh()).rejects.toThrow(
        'No refresh token found'
      );
    });
  });

  describe('logout', () => {
    it('should revoke tokens on server and clear local tokens', async () => {
      let auth = {
        refreshToken: 'refresh_token_456',
      };

      globalConfig.getAuthTokens.mockResolvedValueOnce(auth);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await authService.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/auth/cli/logout',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'refresh_token_456' }),
        })
      );

      expect(globalConfig.clearAuthTokens).toHaveBeenCalled();
    });

    it('should clear local tokens even if server request fails', async () => {
      let auth = {
        refreshToken: 'refresh_token_456',
      };

      globalConfig.getAuthTokens.mockResolvedValueOnce(auth);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await authService.logout();

      expect(globalConfig.clearAuthTokens).toHaveBeenCalled();
    });

    it('should clear tokens when no auth exists', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce(null);

      await authService.logout();

      expect(globalConfig.clearAuthTokens).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('whoami', () => {
    it('should get current user information', async () => {
      let userData = {
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [],
      };

      globalConfig.getAuthTokens.mockResolvedValueOnce({
        accessToken: 'access_token_123',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => userData,
      });

      let result = await authService.whoami();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.vizzly.dev/api/auth/cli/whoami',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer access_token_123',
          }),
        })
      );

      expect(result).toEqual(userData);
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when whoami succeeds', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce({
        accessToken: 'access_token_123',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: {} }),
      });

      let result = await authService.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when whoami fails', async () => {
      globalConfig.getAuthTokens.mockResolvedValueOnce(null);

      let result = await authService.isAuthenticated();

      expect(result).toBe(false);
    });
  });
});
