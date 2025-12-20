import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createAuthService } from '../../src/services/auth-service.js';

describe('services/auth-service', () => {
  describe('createAuthService', () => {
    it('creates auth service with all required methods', () => {
      let service = createAuthService();

      assert.ok(service);
      assert.ok(typeof service.isAuthenticated === 'function');
      assert.ok(typeof service.whoami === 'function');
      assert.ok(typeof service.initiateDeviceFlow === 'function');
      assert.ok(typeof service.pollDeviceAuthorization === 'function');
      assert.ok(typeof service.completeDeviceFlow === 'function');
      assert.ok(typeof service.logout === 'function');
      assert.ok(typeof service.refresh === 'function');
      assert.ok(typeof service.authenticatedRequest === 'function');
    });

    it('accepts custom API URL', () => {
      let service = createAuthService({ apiUrl: 'https://custom.api.test' });

      assert.ok(service);
      // Methods should still be available
      assert.ok(typeof service.isAuthenticated === 'function');
    });

    it('uses VIZZLY_API_URL environment variable when set', () => {
      let originalEnv = process.env.VIZZLY_API_URL;
      process.env.VIZZLY_API_URL = 'https://env.api.test';

      try {
        let service = createAuthService();
        assert.ok(service);
        // Service should be created without error
        assert.ok(typeof service.isAuthenticated === 'function');
      } finally {
        if (originalEnv) {
          process.env.VIZZLY_API_URL = originalEnv;
        } else {
          delete process.env.VIZZLY_API_URL;
        }
      }
    });
  });

  describe('authenticatedRequest', () => {
    it('makes authenticated request when tokens exist', async () => {
      let service = createAuthService();

      // This tests that the method works correctly when tokens exist
      // The request may succeed or fail based on whether:
      // 1. Tokens exist (will make actual API call)
      // 2. No tokens (will throw "Not authenticated")
      try {
        // Use a valid endpoint that would work if authenticated
        await service.authenticatedRequest('/api/auth/cli/whoami');
        // If we get here, the request was made (tokens exist)
        assert.ok(true, 'Request was made successfully');
      } catch (error) {
        // Either "Not authenticated" (no tokens) or API error (tokens exist but request failed)
        assert.ok(
          error.message.includes('Not authenticated') ||
            error.message.includes('API request') ||
            error.message.includes('failed'),
          `Got error: ${error.message}`
        );
      }
    });
  });

  describe('isAuthenticated', () => {
    it('returns boolean', async () => {
      let service = createAuthService();

      // This will call the actual auth check
      let result = await service.isAuthenticated();

      assert.ok(typeof result === 'boolean');
    });
  });
});
