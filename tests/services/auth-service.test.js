import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createAuthService } from '../../src/services/auth-service.js';
import {
  createInMemoryTokenStore,
  createMockHttpClient,
} from '../auth/test-helpers.js';

describe('services/auth-service', () => {
  describe('isAuthenticated', () => {
    it('returns true when authenticated', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
      });
      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': { user: { email: 'test@example.com' } },
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.isAuthenticated();

      assert.strictEqual(result, true);
    });

    it('returns false when no tokens exist', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.isAuthenticated();

      assert.strictEqual(result, false);
    });

    it('returns false when API call fails', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
      });
      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': new Error('Token expired'),
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.isAuthenticated();

      assert.strictEqual(result, false);
    });
  });

  describe('whoami', () => {
    it('returns user data when authenticated', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
      });
      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': {
          user: { email: 'user@example.com', name: 'Test User' },
          organizations: [{ slug: 'test-org' }],
        },
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.whoami();

      assert.strictEqual(result.user.email, 'user@example.com');
      assert.strictEqual(result.organizations[0].slug, 'test-org');
    });

    it('throws when no access token exists', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});
      let service = createAuthService({ httpClient, tokenStore });

      await assert.rejects(() => service.whoami(), /authentication|login/i);
    });
  });

  describe('initiateDeviceFlow', () => {
    it('returns device flow data', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/initiate': {
          device_code: 'device-123',
          user_code: 'ABCD-1234',
          verification_uri: 'https://auth.example.com/device',
          expires_in: 600,
          interval: 5,
        },
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.initiateDeviceFlow();

      assert.strictEqual(result.device_code, 'device-123');
      assert.strictEqual(result.user_code, 'ABCD-1234');
    });

    it('throws on API error', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/initiate': new Error('Service unavailable'),
      });
      let service = createAuthService({ httpClient, tokenStore });

      await assert.rejects(
        () => service.initiateDeviceFlow(),
        /Service unavailable/
      );
    });
  });

  describe('pollDeviceAuthorization', () => {
    it('returns pending status', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/poll': { status: 'pending' },
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.pollDeviceAuthorization('device-123');

      assert.strictEqual(result.status, 'pending');
    });

    it('returns tokens when authorized', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({
        '/api/auth/cli/device/poll': {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        },
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.pollDeviceAuthorization('device-123');

      assert.strictEqual(result.accessToken, 'new-access-token');
    });
  });

  describe('completeDeviceFlow', () => {
    it('saves tokens to store', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});
      let service = createAuthService({ httpClient, tokenStore });

      await service.completeDeviceFlow({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      let stored = tokenStore._getState();
      assert.strictEqual(stored.accessToken, 'new-access');
      assert.strictEqual(stored.refreshToken, 'new-refresh');
    });
  });

  describe('logout', () => {
    it('clears tokens from store', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      let httpClient = createMockHttpClient({
        '/api/auth/cli/logout': { success: true },
      });
      let service = createAuthService({ httpClient, tokenStore });

      await service.logout();

      assert.strictEqual(tokenStore._getState(), null);
    });

    it('clears tokens even when server revocation fails', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      let httpClient = createMockHttpClient({
        '/api/auth/cli/logout': new Error('Server error'),
      });
      let service = createAuthService({ httpClient, tokenStore });

      // Should not throw - logs warning but still clears tokens
      await service.logout();

      assert.strictEqual(tokenStore._getState(), null);
    });
  });

  describe('refresh', () => {
    it('refreshes tokens and saves new ones', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        user: { email: 'user@example.com' },
      });
      let httpClient = createMockHttpClient({
        '/api/auth/cli/refresh': {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
        },
      });
      let service = createAuthService({ httpClient, tokenStore });

      await service.refresh();

      let stored = tokenStore._getState();
      assert.strictEqual(stored.accessToken, 'new-access');
      assert.strictEqual(stored.refreshToken, 'new-refresh');
      // Should preserve user data
      assert.strictEqual(stored.user.email, 'user@example.com');
    });

    it('throws when no refresh token exists', async () => {
      let tokenStore = createInMemoryTokenStore({ accessToken: 'access' });
      let httpClient = createMockHttpClient({});
      let service = createAuthService({ httpClient, tokenStore });

      await assert.rejects(() => service.refresh(), /refresh token/i);
    });
  });

  describe('authenticatedRequest', () => {
    it('makes request with access token', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'valid-token',
        refreshToken: 'refresh',
      });
      let httpClient = createMockHttpClient({
        '/api/custom/endpoint': { data: 'result' },
      });
      let service = createAuthService({ httpClient, tokenStore });

      let result = await service.authenticatedRequest('/api/custom/endpoint');

      assert.strictEqual(result.data, 'result');
      // Verify the token was passed
      let lastCall = httpClient._getLastCall();
      assert.strictEqual(lastCall.accessToken, 'valid-token');
    });

    it('throws when not authenticated', async () => {
      let tokenStore = createInMemoryTokenStore(null);
      let httpClient = createMockHttpClient({});
      let service = createAuthService({ httpClient, tokenStore });

      await assert.rejects(
        () => service.authenticatedRequest('/api/endpoint'),
        /Not authenticated/
      );
    });

    it('passes custom options to request', async () => {
      let tokenStore = createInMemoryTokenStore({
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      let httpClient = createMockHttpClient({
        '/api/endpoint': { success: true },
      });
      let service = createAuthService({ httpClient, tokenStore });

      await service.authenticatedRequest('/api/endpoint', {
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      });

      let lastCall = httpClient._getLastCall();
      assert.strictEqual(lastCall.options.method, 'POST');
      assert.ok(lastCall.options.body.includes('key'));
    });
  });
});
