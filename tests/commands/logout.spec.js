/**
 * Tests for logout command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logoutCommand } from '../../src/commands/logout.js';
import { AuthService } from '../../src/services/auth-service.js';
import * as globalConfig from '../../src/utils/global-config.js';

// Mock AuthService
vi.mock('../../src/services/auth-service.js', () => ({
  AuthService: vi.fn(),
}));

// Mock global-config
vi.mock('../../src/utils/global-config.js', () => ({
  getAuthTokens: vi.fn(),
}));

describe('Logout Command', () => {
  let mockAuthService;
  let consoleLogSpy;
  let processExitSpy;

  beforeEach(() => {
    // Mock AuthService instance
    mockAuthService = {
      logout: vi.fn(),
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

  describe('Successful logout', () => {
    it('should logout successfully when user is logged in', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
        refreshToken: 'test_refresh_token',
      });

      mockAuthService.logout.mockResolvedValue();

      await logoutCommand({}, {});

      expect(mockAuthService.logout).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should display success message after logout', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.logout.mockResolvedValue();

      await logoutCommand({}, {});

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasSuccessMessage = logCalls.some(
        call =>
          call.includes('logged out') || call.includes('authentication tokens')
      );
      expect(hasSuccessMessage).toBe(true);
    });

    it('should output JSON when --json flag is set', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.logout.mockResolvedValue();

      await logoutCommand({}, { json: true });

      expect(mockAuthService.logout).toHaveBeenCalled();
    });
  });

  describe('Not logged in', () => {
    it('should show message when no auth tokens exist', async () => {
      globalConfig.getAuthTokens.mockResolvedValue(null);

      await logoutCommand({}, {});

      expect(mockAuthService.logout).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should show message when auth has no access token', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        refreshToken: 'test_refresh_token',
        // No accessToken
      });

      await logoutCommand({}, {});

      expect(mockAuthService.logout).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle logout errors gracefully', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.logout.mockRejectedValue(new Error('Network error'));

      await logoutCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should show error stack trace in verbose mode', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      let errorWithStack = new Error('Test error');
      errorWithStack.stack = 'Error stack trace';

      mockAuthService.logout.mockRejectedValue(errorWithStack);

      let consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await logoutCommand({}, { verbose: true });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error stack trace')
      );

      consoleErrorSpy.mockRestore();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Options handling', () => {
    it('should use custom API URL when provided', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.logout.mockResolvedValue();

      await logoutCommand({ apiUrl: 'https://custom.vizzly.dev' }, {});

      expect(AuthService).toHaveBeenCalledWith({
        baseUrl: 'https://custom.vizzly.dev',
      });
    });
  });
});
