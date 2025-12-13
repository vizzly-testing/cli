import { describe, expect, it } from 'vitest';
import {
  completeDeviceFlow,
  initiateDeviceFlow,
  isAuthenticated,
  logout,
  pollDeviceAuthorization,
  refresh,
  whoami,
} from '../../src/auth/operations.js';
import { AuthError } from '../../src/errors/vizzly-error.js';
import {
  createInMemoryTokenStore,
  createMockHttpClient,
} from './test-helpers.js';

describe('auth/operations', () => {
  describe('initiateDeviceFlow', () => {
    it('calls device initiate endpoint', async () => {
      let mockResponse = {
        deviceCode: 'device_123',
        userCode: 'ABCD-EFGH',
        verificationUrl: 'https://vizzly.dev/activate',
        expiresIn: 600,
      };

      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/initiate': mockResponse,
      });

      let result = await initiateDeviceFlow(httpClient);

      expect(result).toEqual(mockResponse);

      let lastCall = httpClient._getLastCall();
      expect(lastCall.endpoint).toBe('/api/auth/cli/device/initiate');
      expect(lastCall.options.method).toBe('POST');
    });
  });

  describe('pollDeviceAuthorization', () => {
    it('polls with device code', async () => {
      let mockResponse = { status: 'pending' };

      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/poll': mockResponse,
      });

      let result = await pollDeviceAuthorization(httpClient, 'device_123');

      expect(result).toEqual(mockResponse);

      let lastCall = httpClient._getLastCall();
      expect(lastCall.options.body).toContain('device_123');
    });

    it('returns tokens when authorized', async () => {
      let mockResponse = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: '2025-12-31',
        user: { id: 'user_1' },
      };

      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/poll': mockResponse,
      });

      let result = await pollDeviceAuthorization(httpClient, 'device_123');

      expect(result.accessToken).toBe('access_token');
    });
  });

  describe('completeDeviceFlow', () => {
    it('saves tokens to store', async () => {
      let tokenStore = createInMemoryTokenStore();
      let tokenData = {
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
        expiresAt: '2025-12-31',
        user: { id: 'user_1', name: 'Test User' },
      };

      let result = await completeDeviceFlow(tokenStore, tokenData);

      expect(result).toEqual(tokenData);

      let savedTokens = tokenStore._getState();
      expect(savedTokens.accessToken).toBe('access_123');
      expect(savedTokens.refreshToken).toBe('refresh_456');
      expect(savedTokens.user.name).toBe('Test User');
    });
  });

  describe('refresh', () => {
    it('refreshes tokens successfully', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'old_access',
        refreshToken: 'refresh_token',
        user: { id: 'user_1', name: 'Test User' },
      });

      let newTokens = {
        accessToken: 'new_access',
        refreshToken: 'new_refresh',
        expiresAt: '2025-12-31',
      };

      let httpClient = createMockHttpClient({
        '/api/auth/cli/refresh': newTokens,
      });

      let result = await refresh(httpClient, tokenStore);

      expect(result.accessToken).toBe('new_access');

      // Check tokens were saved with preserved user
      let savedTokens = tokenStore._getState();
      expect(savedTokens.accessToken).toBe('new_access');
      expect(savedTokens.refreshToken).toBe('new_refresh');
      expect(savedTokens.user.name).toBe('Test User');
    });

    it('throws when no refresh token exists', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});

      await expect(refresh(httpClient, tokenStore)).rejects.toThrow(AuthError);
      await expect(refresh(httpClient, tokenStore)).rejects.toThrow(
        'No refresh token found'
      );
    });

    it('throws when refresh token is missing from auth object', async () => {
      let tokenStore = createInMemoryTokenStore({ accessToken: 'access_only' });
      let httpClient = createMockHttpClient({});

      await expect(refresh(httpClient, tokenStore)).rejects.toThrow(
        'No refresh token found'
      );
    });

    it('sends refresh token in request body', async () => {
      let tokenStore = createInMemoryTokenStore({
        refreshToken: 'my_refresh_token',
      });

      let httpClient = createMockHttpClient({
        '/api/auth/cli/refresh': { accessToken: 'new', refreshToken: 'new_r' },
      });

      await refresh(httpClient, tokenStore);

      let lastCall = httpClient._getLastCall();
      expect(lastCall.options.body).toContain('my_refresh_token');
    });
  });

  describe('logout', () => {
    it('revokes tokens on server and clears local', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'access',
        refreshToken: 'refresh_token',
      });

      let httpClient = createMockHttpClient({
        '/api/auth/cli/logout': { success: true },
      });

      await logout(httpClient, tokenStore);

      // Tokens should be cleared
      expect(tokenStore._getState()).toBeNull();

      // Should have called logout endpoint
      let lastCall = httpClient._getLastCall();
      expect(lastCall.endpoint).toBe('/api/auth/cli/logout');
      expect(lastCall.options.body).toContain('refresh_token');
    });

    it('clears local tokens even if server fails', async () => {
      let tokenStore = createInMemoryTokenStore({
        refreshToken: 'refresh_token',
      });

      let httpClient = createMockHttpClient({
        '/api/auth/cli/logout': new Error('Network error'),
      });

      // Should not throw
      await logout(httpClient, tokenStore);

      // Tokens should still be cleared
      expect(tokenStore._getState()).toBeNull();
    });

    it('clears tokens when no auth exists', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});

      await logout(httpClient, tokenStore);

      expect(tokenStore._getState()).toBeNull();
      // Should not have made any HTTP calls
      expect(httpClient._getCalls()).toHaveLength(0);
    });

    it('skips server call when no refresh token', async () => {
      let tokenStore = createInMemoryTokenStore({ accessToken: 'access_only' });
      let httpClient = createMockHttpClient({});

      await logout(httpClient, tokenStore);

      expect(httpClient._getCalls()).toHaveLength(0);
    });
  });

  describe('whoami', () => {
    it('returns user information', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'access_token',
      });

      let userData = {
        user: { id: 'user_1', name: 'Test User', email: 'test@example.com' },
        organizations: [{ id: 'org_1', name: 'Test Org' }],
      };

      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': userData,
      });

      let result = await whoami(httpClient, tokenStore);

      expect(result).toEqual(userData);

      let lastCall = httpClient._getLastCall();
      expect(lastCall.type).toBe('authenticatedRequest');
      expect(lastCall.accessToken).toBe('access_token');
    });

    it('throws when not authenticated', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});

      await expect(whoami(httpClient, tokenStore)).rejects.toThrow(AuthError);
      await expect(whoami(httpClient, tokenStore)).rejects.toThrow(
        'No authentication token found'
      );
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when whoami succeeds', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'valid_token',
      });

      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': { user: {} },
      });

      let result = await isAuthenticated(httpClient, tokenStore);

      expect(result).toBe(true);
    });

    it('returns false when no tokens', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});

      let result = await isAuthenticated(httpClient, tokenStore);

      expect(result).toBe(false);
    });

    it('returns false when whoami fails', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'expired_token',
      });

      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': new Error('Token expired'),
      });

      let result = await isAuthenticated(httpClient, tokenStore);

      expect(result).toBe(false);
    });
  });
});
