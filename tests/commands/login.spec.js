/**
 * Tests for login command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loginCommand } from '../../src/commands/login.js';
import { AuthService } from '../../src/services/auth-service.js';
import * as browser from '../../src/utils/browser.js';

// Mock AuthService
const mockAuthServiceStore = { mockInstance: null };

vi.mock('../../src/services/auth-service.js', () => ({
  AuthService: vi.fn(function () {
    return mockAuthServiceStore.mockInstance;
  }),
}));

// Mock browser utils
vi.mock('../../src/utils/browser.js', () => ({
  openBrowser: vi.fn(),
}));

describe('Login Command', () => {
  let mockAuthService;
  let stdinSpies;
  let consoleLogSpy;
  let processExitSpy;

  beforeEach(() => {
    // Mock AuthService instance
    mockAuthService = {
      initiateDeviceFlow: vi.fn(),
      pollDeviceAuthorization: vi.fn(),
      completeDeviceFlow: vi.fn(),
    };
    mockAuthServiceStore.mockInstance = mockAuthService;

    // Mock browser.openBrowser
    browser.openBrowser.mockResolvedValue(true);

    // Add stdin methods if they don't exist (for test environment)
    if (!process.stdin.setRawMode) {
      process.stdin.setRawMode = () => {};
    }
    if (!process.stdin.resume) {
      process.stdin.resume = () => {};
    }
    if (!process.stdin.pause) {
      process.stdin.pause = () => {};
    }

    // Mock stdin for "press Enter to continue" flow
    stdinSpies = {
      setRawMode: vi
        .spyOn(process.stdin, 'setRawMode')
        .mockImplementation(() => {}),
      resume: vi.spyOn(process.stdin, 'resume').mockImplementation(() => {}),
      pause: vi.spyOn(process.stdin, 'pause').mockImplementation(() => {}),
      once: vi
        .spyOn(process.stdin, 'once')
        .mockImplementation((event, callback) => {
          // Immediately call the callback to simulate user pressing Enter
          setTimeout(() => callback(), 0);
        }),
    };

    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (stdinSpies) {
      stdinSpies.setRawMode?.mockRestore();
      stdinSpies.resume?.mockRestore();
      stdinSpies.pause?.mockRestore();
      stdinSpies.once?.mockRestore();
    }
    consoleLogSpy?.mockRestore();
    processExitSpy?.mockRestore();
  });

  describe('Successful login flow', () => {
    it('should complete OAuth device flow successfully', async () => {
      // Mock device flow initiation
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
        interval: 5,
      });

      // Mock successful authorization poll
      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        tokens: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
          expiresIn: 2592000, // 30 days
        },
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [
          {
            name: 'Test Org',
            slug: 'test-org',
          },
        ],
      });

      mockAuthService.completeDeviceFlow.mockResolvedValue({});

      await loginCommand({}, {});

      // Verify auth service methods were called
      expect(mockAuthService.initiateDeviceFlow).toHaveBeenCalled();
      expect(mockAuthService.pollDeviceAuthorization).toHaveBeenCalledWith(
        'device_123'
      );
      expect(mockAuthService.completeDeviceFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
        })
      );

      // Verify browser was opened
      expect(browser.openBrowser).toHaveBeenCalledWith(
        'https://vizzly.dev/activate?code=ABCD-EFGH'
      );

      // Verify user was prompted to press Enter
      expect(stdinSpies.setRawMode).toHaveBeenCalledWith(true);
      expect(stdinSpies.resume).toHaveBeenCalled();
      expect(stdinSpies.once).toHaveBeenCalledWith(
        'data',
        expect.any(Function)
      );
    });

    it('should handle camelCase API response', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        deviceCode: 'device_123',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://vizzly.dev/activate',
        expiresIn: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        tokens: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
          expiresIn: 2592000,
        },
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      });

      mockAuthService.completeDeviceFlow.mockResolvedValue({});

      await loginCommand({}, {});

      expect(mockAuthService.completeDeviceFlow).toHaveBeenCalled();
    });

    it('should display user and organization info on success', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        tokens: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
          expiresIn: 2592000,
        },
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
        organizations: [
          {
            name: 'Test Org',
            slug: 'test-org',
          },
        ],
      });

      mockAuthService.completeDeviceFlow.mockResolvedValue({});

      await loginCommand({}, {});

      // Check that user info was logged
      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasUserInfo = logCalls.some(
        call => call.includes('Test User') || call.includes('test@example.com')
      );
      expect(hasUserInfo).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle pending authorization status', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        status: 'pending',
      });

      await loginCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle expired device code', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        status: 'expired',
      });

      await loginCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle denied authorization', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        status: 'denied',
      });

      await loginCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle invalid device flow response', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        // Missing required fields
        device_code: 'device_123',
      });

      await loginCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle network errors gracefully', async () => {
      mockAuthService.initiateDeviceFlow.mockRejectedValue(
        new Error('Network error')
      );

      await loginCommand({}, {});

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should show browser warning when browser fails to open', async () => {
      browser.openBrowser.mockResolvedValue(false);

      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        tokens: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
          expiresIn: 2592000,
        },
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      });

      mockAuthService.completeDeviceFlow.mockResolvedValue({});

      await loginCommand({}, {});

      // Should still complete successfully
      expect(mockAuthService.completeDeviceFlow).toHaveBeenCalled();
    });
  });

  describe('Options handling', () => {
    it('should use custom API URL when provided', async () => {
      mockAuthService.initiateDeviceFlow.mockResolvedValue({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://vizzly.dev/activate',
        expires_in: 600,
      });

      mockAuthService.pollDeviceAuthorization.mockResolvedValue({
        tokens: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
          expiresIn: 2592000,
        },
        user: {
          id: 'user_123',
          name: 'Test User',
          email: 'test@example.com',
        },
      });

      mockAuthService.completeDeviceFlow.mockResolvedValue({});

      await loginCommand({ apiUrl: 'https://custom.vizzly.dev' }, {});

      expect(AuthService).toHaveBeenCalledWith({
        baseUrl: 'https://custom.vizzly.dev',
      });
    });

    it('should respect verbose flag in error output', async () => {
      let errorWithStack = new Error('Test error');
      errorWithStack.stack = 'Error stack trace';

      mockAuthService.initiateDeviceFlow.mockRejectedValue(errorWithStack);

      let consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await loginCommand({}, { verbose: true });

      // Verify stack trace was logged in verbose mode
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error stack trace')
      );

      consoleErrorSpy.mockRestore();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
