/**
 * Tests for whoami command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { whoamiCommand } from '../../src/commands/whoami.js';
import { AuthService } from '../../src/services/auth-service.js';
import { AuthError } from '../../src/errors/vizzly-error.js';
import * as globalConfig from '../../src/utils/global-config.js';

// Mock AuthService
vi.mock('../../src/services/auth-service.js', () => ({
  AuthService: vi.fn(),
}));

// Mock global-config
vi.mock('../../src/utils/global-config.js', () => ({
  getAuthTokens: vi.fn(),
}));

describe('Whoami Command', () => {
  let mockAuthService;
  let consoleLogSpy;
  let processExitSpy;

  beforeEach(() => {
    // Mock AuthService instance
    mockAuthService = {
      whoami: vi.fn(),
    };
    AuthService.mockImplementation(() => mockAuthService);

    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Authenticated user', () => {
    it('should display user information when logged in', async () => {
      let futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: futureDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
          username: 'testuser',
        },
        organizations: [
          {
            id: 'org_123',
            name: 'Test Org',
            slug: 'test-org',
            role: 'owner',
          },
        ],
      });

      await whoamiCommand({}, {});

      expect(mockAuthService.whoami).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();

      // Check that user info was logged
      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasUserInfo = logCalls.some(
        call => call.includes('Test User') || call.includes('test@example.com')
      );
      expect(hasUserInfo).toBe(true);
    });

    it('should display organization info', async () => {
      let futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: futureDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [
          {
            name: 'Test Org',
            slug: 'test-org',
            role: 'owner',
          },
        ],
      });

      await whoamiCommand({}, {});

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasOrgInfo = logCalls.some(call => call.includes('Test Org'));
      expect(hasOrgInfo).toBe(true);
    });

    it('should show token expiry information', async () => {
      let futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: futureDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [],
      });

      await whoamiCommand({}, {});

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasExpiryInfo = logCalls.some(
        call => call.includes('expires') || call.includes('day')
      );
      expect(hasExpiryInfo).toBe(true);
    });

    it('should warn when token is expired', async () => {
      let pastDate = new Date(Date.now() - 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: pastDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [],
      });

      await whoamiCommand({}, {});

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasExpiredWarning = logCalls.some(call => call.includes('expired'));
      expect(hasExpiredWarning).toBe(true);
    });

    it('should output JSON when --json flag is set', async () => {
      let futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: futureDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [],
      });

      await whoamiCommand({}, { json: true });

      expect(mockAuthService.whoami).toHaveBeenCalled();
    });

    it('should show verbose info when --verbose flag is set', async () => {
      let futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: futureDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [
          {
            id: 'org_123',
            name: 'Test Org',
          },
        ],
      });

      await whoamiCommand({}, { verbose: true });

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasUserId = logCalls.some(call => call.includes('user_123'));
      expect(hasUserId).toBe(true);
    });
  });

  describe('Not authenticated', () => {
    it('should show message when no auth tokens exist', async () => {
      globalConfig.getAuthTokens.mockResolvedValue(null);

      await whoamiCommand({}, {});

      expect(mockAuthService.whoami).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should show message when auth has no access token', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        refreshToken: 'test_refresh_token',
        // No accessToken
      });

      await whoamiCommand({}, {});

      expect(mockAuthService.whoami).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should output JSON when not authenticated with --json flag', async () => {
      globalConfig.getAuthTokens.mockResolvedValue(null);

      await whoamiCommand({}, { json: true });

      expect(mockAuthService.whoami).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle AuthError gracefully', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'expired_token',
      });

      let authError = new AuthError('Token expired');
      mockAuthService.whoami.mockRejectedValue(authError);

      await whoamiCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON on AuthError with --json flag', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'expired_token',
      });

      let authError = new AuthError('Token expired');
      mockAuthService.whoami.mockRejectedValue(authError);

      await whoamiCommand({}, { json: true });

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle other errors gracefully', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.whoami.mockRejectedValue(new Error('Network error'));

      await whoamiCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should show error stack trace in verbose mode', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      let errorWithStack = new Error('Test error');
      errorWithStack.stack = 'Error stack trace';

      mockAuthService.whoami.mockRejectedValue(errorWithStack);

      let consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await whoamiCommand({}, { verbose: true });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error stack trace')
      );

      consoleErrorSpy.mockRestore();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Options handling', () => {
    it('should use custom API URL when provided', async () => {
      let futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        expiresAt: futureDate.toISOString(),
      });

      mockAuthService.whoami.mockResolvedValue({
        user: {
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [],
      });

      await whoamiCommand({ apiUrl: 'https://custom.vizzly.dev' }, {});

      expect(AuthService).toHaveBeenCalledWith({
        baseUrl: 'https://custom.vizzly.dev',
      });
    });
  });
});
