import { describe, expect, it } from 'vitest';
import {
  buildAuthHeader,
  buildAuthUserAgent,
  buildDevicePollPayload,
  buildLogoutPayload,
  buildRefreshPayload,
  buildRequestHeaders,
  buildTokenData,
  parseAuthError,
  parseAuthenticatedError,
  validateTokens,
} from '../../src/auth/core.js';
import { AuthError, VizzlyError } from '../../src/errors/vizzly-error.js';

describe('auth/core', () => {
  describe('buildAuthHeader', () => {
    it('returns Bearer token header', () => {
      expect(buildAuthHeader('abc123')).toEqual({
        Authorization: 'Bearer abc123',
      });
    });

    it('returns empty object for null token', () => {
      expect(buildAuthHeader(null)).toEqual({});
    });

    it('returns empty object for undefined token', () => {
      expect(buildAuthHeader(undefined)).toEqual({});
    });

    it('returns empty object for empty string', () => {
      expect(buildAuthHeader('')).toEqual({});
    });
  });

  describe('buildAuthUserAgent', () => {
    it('builds user agent string with version', () => {
      let ua = buildAuthUserAgent('1.2.3');
      expect(ua).toBe('vizzly-cli/1.2.3 (auth)');
    });
  });

  describe('buildRequestHeaders', () => {
    it('builds headers with user agent only', () => {
      let headers = buildRequestHeaders({ userAgent: 'test-agent' });
      expect(headers).toEqual({ 'User-Agent': 'test-agent' });
    });

    it('builds headers with access token', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        accessToken: 'token123',
      });
      expect(headers).toEqual({
        'User-Agent': 'test-agent',
        Authorization: 'Bearer token123',
      });
    });

    it('builds headers with content type', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        contentType: 'application/json',
      });
      expect(headers).toEqual({
        'User-Agent': 'test-agent',
        'Content-Type': 'application/json',
      });
    });

    it('merges extra headers', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        extra: { 'X-Custom': 'value' },
      });
      expect(headers).toEqual({
        'User-Agent': 'test-agent',
        'X-Custom': 'value',
      });
    });

    it('builds complete headers', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        accessToken: 'token123',
        contentType: 'application/json',
        extra: { 'X-Custom': 'value' },
      });
      expect(headers).toEqual({
        'User-Agent': 'test-agent',
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      });
    });
  });

  describe('parseAuthError', () => {
    it('returns AuthError for 401 with message', () => {
      let error = parseAuthError(401, { error: 'Bad credentials' }, '/login');
      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toBe('Bad credentials');
    });

    it('returns AuthError for 401 with default message', () => {
      let error = parseAuthError(401, {}, '/login');
      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain('Invalid credentials');
    });

    it('returns VizzlyError for 429 rate limit', () => {
      let error = parseAuthError(429, {}, '/login');
      expect(error).toBeInstanceOf(VizzlyError);
      expect(error.message).toContain('Too many login attempts');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
    });

    it('returns VizzlyError for other status codes', () => {
      let error = parseAuthError(500, { error: 'Server error' }, '/test');
      expect(error).toBeInstanceOf(VizzlyError);
      expect(error.message).toContain('500');
      expect(error.message).toContain('Server error');
      expect(error.code).toBe('AUTH_REQUEST_ERROR');
    });

    it('handles string body', () => {
      let error = parseAuthError(500, 'Plain text error', '/test');
      expect(error.message).toContain('Plain text error');
    });

    it('handles null body', () => {
      let error = parseAuthError(500, null, '/test');
      expect(error.message).toContain('500');
    });
  });

  describe('parseAuthenticatedError', () => {
    it('returns AuthError for 401 with expired message', () => {
      let error = parseAuthenticatedError(401, {}, '/api/protected');
      expect(error).toBeInstanceOf(AuthError);
      expect(error.message).toContain('invalid or expired');
    });

    it('returns VizzlyError for other status with endpoint', () => {
      let error = parseAuthenticatedError(
        403,
        { error: 'Forbidden' },
        '/api/protected'
      );
      expect(error).toBeInstanceOf(VizzlyError);
      expect(error.message).toContain('403');
      expect(error.message).toContain('/api/protected');
      expect(error.code).toBe('API_REQUEST_ERROR');
    });
  });

  describe('buildDevicePollPayload', () => {
    it('builds device poll payload', () => {
      expect(buildDevicePollPayload('device_123')).toEqual({
        device_code: 'device_123',
      });
    });
  });

  describe('buildRefreshPayload', () => {
    it('builds refresh payload', () => {
      expect(buildRefreshPayload('refresh_token_456')).toEqual({
        refreshToken: 'refresh_token_456',
      });
    });
  });

  describe('buildLogoutPayload', () => {
    it('builds logout payload', () => {
      expect(buildLogoutPayload('refresh_token_789')).toEqual({
        refreshToken: 'refresh_token_789',
      });
    });
  });

  describe('buildTokenData', () => {
    it('builds token data from response', () => {
      let response = {
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
        expiresAt: '2025-12-31',
        user: { id: 'user_1', name: 'Test' },
      };

      let tokenData = buildTokenData(response);

      expect(tokenData).toEqual({
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
        expiresAt: '2025-12-31',
        user: { id: 'user_1', name: 'Test' },
      });
    });

    it('preserves existing user when response has no user', () => {
      let response = {
        accessToken: 'new_access',
        refreshToken: 'new_refresh',
        expiresAt: '2025-12-31',
      };
      let existingUser = { id: 'user_1', name: 'Existing User' };

      let tokenData = buildTokenData(response, existingUser);

      expect(tokenData.user).toEqual(existingUser);
    });

    it('uses response user over existing user', () => {
      let response = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: '2025-12-31',
        user: { id: 'new_user', name: 'New' },
      };
      let existingUser = { id: 'old_user', name: 'Old' };

      let tokenData = buildTokenData(response, existingUser);

      expect(tokenData.user).toEqual({ id: 'new_user', name: 'New' });
    });
  });

  describe('validateTokens', () => {
    it('validates access token exists', () => {
      let result = validateTokens({ accessToken: 'token123' }, 'accessToken');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('validates refresh token exists', () => {
      let result = validateTokens(
        { refreshToken: 'refresh123' },
        'refreshToken'
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns error for missing access token', () => {
      let result = validateTokens(null, 'accessToken');
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(AuthError);
      expect(result.error.message).toContain('No authentication token found');
    });

    it('returns error for missing refresh token', () => {
      let result = validateTokens({}, 'refreshToken');
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(AuthError);
      expect(result.error.message).toContain('No refresh token found');
    });

    it('defaults to checking accessToken', () => {
      let result = validateTokens(null);
      expect(result.error.message).toContain('authentication token');
    });
  });
});
