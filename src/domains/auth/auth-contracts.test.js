import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AuthError, VizzlyError } from '../../errors/vizzly-error.js';
import {
  buildTokenData,
  buildTokens,
  normalizeDeviceFlowResponse,
} from './auth.normalizers.js';
import { resolveAuthorizedTokenData } from './auth.rules.js';
import {
  buildDevicePollPayload,
  buildLogoutPayload,
  buildRefreshPayload,
} from './auth.serializers.js';
import { validateTokens } from './auth.validations.js';
import { parseAuthError, parseAuthenticatedError } from './auth-errors.js';
import {
  buildAuthHeader,
  buildAuthUserAgent,
  buildRequestHeaders,
} from './auth-headers.js';

describe('auth/core', () => {
  describe('buildAuthHeader', () => {
    it('returns Bearer token header', () => {
      assert.deepStrictEqual(buildAuthHeader('abc123'), {
        Authorization: 'Bearer abc123',
      });
    });

    it('returns empty object for null token', () => {
      assert.deepStrictEqual(buildAuthHeader(null), {});
    });

    it('returns empty object for undefined token', () => {
      assert.deepStrictEqual(buildAuthHeader(undefined), {});
    });

    it('returns empty object for empty string', () => {
      assert.deepStrictEqual(buildAuthHeader(''), {});
    });
  });

  describe('buildAuthUserAgent', () => {
    it('builds user agent string with version', () => {
      let ua = buildAuthUserAgent('1.2.3');
      assert.strictEqual(ua, 'vizzly-cli/1.2.3 (auth)');
    });
  });

  describe('buildRequestHeaders', () => {
    it('builds headers with user agent only', () => {
      let headers = buildRequestHeaders({ userAgent: 'test-agent' });
      assert.deepStrictEqual(headers, { 'User-Agent': 'test-agent' });
    });

    it('builds headers with access token', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        accessToken: 'token123',
      });
      assert.deepStrictEqual(headers, {
        'User-Agent': 'test-agent',
        Authorization: 'Bearer token123',
      });
    });

    it('builds headers with content type', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        contentType: 'application/json',
      });
      assert.deepStrictEqual(headers, {
        'User-Agent': 'test-agent',
        'Content-Type': 'application/json',
      });
    });

    it('merges extra headers', () => {
      let headers = buildRequestHeaders({
        userAgent: 'test-agent',
        extra: { 'X-Custom': 'value' },
      });
      assert.deepStrictEqual(headers, {
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
      assert.deepStrictEqual(headers, {
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
      assert.ok(error instanceof AuthError);
      assert.strictEqual(error.message, 'Bad credentials');
    });

    it('returns AuthError for 401 with default message', () => {
      let error = parseAuthError(401, {}, '/login');
      assert.ok(error instanceof AuthError);
      assert.ok(error.message.includes('Invalid credentials'));
    });

    it('returns VizzlyError for 429 rate limit', () => {
      let error = parseAuthError(429, {}, '/login');
      assert.ok(error instanceof VizzlyError);
      assert.ok(error.message.includes('Too many login attempts'));
      assert.strictEqual(error.code, 'RATE_LIMIT_ERROR');
    });

    it('returns VizzlyError for other status codes', () => {
      let error = parseAuthError(500, { error: 'Server error' }, '/test');
      assert.ok(error instanceof VizzlyError);
      assert.ok(error.message.includes('500'));
      assert.ok(error.message.includes('Server error'));
      assert.strictEqual(error.code, 'AUTH_REQUEST_ERROR');
    });

    it('handles string body', () => {
      let error = parseAuthError(500, 'Plain text error', '/test');
      assert.ok(error.message.includes('Plain text error'));
    });

    it('handles null body', () => {
      let error = parseAuthError(500, null, '/test');
      assert.ok(error.message.includes('500'));
    });
  });

  describe('parseAuthenticatedError', () => {
    it('returns AuthError for 401 with expired message', () => {
      let error = parseAuthenticatedError(401, {}, '/api/protected');
      assert.ok(error instanceof AuthError);
      assert.ok(error.message.includes('invalid or expired'));
    });

    it('returns VizzlyError for other status with endpoint', () => {
      let error = parseAuthenticatedError(
        403,
        { error: 'Forbidden' },
        '/api/protected'
      );
      assert.ok(error instanceof VizzlyError);
      assert.ok(error.message.includes('403'));
      assert.ok(error.message.includes('/api/protected'));
      assert.strictEqual(error.code, 'API_REQUEST_ERROR');
    });
  });

  describe('buildDevicePollPayload', () => {
    it('builds device poll payload', () => {
      assert.deepStrictEqual(buildDevicePollPayload('device_123'), {
        device_code: 'device_123',
      });
    });
  });

  describe('buildRefreshPayload', () => {
    it('builds refresh payload', () => {
      assert.deepStrictEqual(buildRefreshPayload('refresh_token_456'), {
        refreshToken: 'refresh_token_456',
      });
    });
  });

  describe('buildLogoutPayload', () => {
    it('builds logout payload', () => {
      assert.deepStrictEqual(buildLogoutPayload('refresh_token_789'), {
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

      assert.deepStrictEqual(tokenData, {
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

      assert.deepStrictEqual(tokenData.user, existingUser);
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

      assert.deepStrictEqual(tokenData.user, { id: 'new_user', name: 'New' });
    });
  });

  describe('validateTokens', () => {
    it('validates access token exists', () => {
      let result = validateTokens({ accessToken: 'token123' }, 'accessToken');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('validates refresh token exists', () => {
      let result = validateTokens(
        { refreshToken: 'refresh123' },
        'refreshToken'
      );
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns error for missing access token', () => {
      let result = validateTokens(null, 'accessToken');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error instanceof AuthError);
      assert.ok(result.error.message.includes('No authentication token found'));
    });

    it('returns error for missing refresh token', () => {
      let result = validateTokens({}, 'refreshToken');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error instanceof AuthError);
      assert.ok(result.error.message.includes('No refresh token found'));
    });

    it('defaults to checking accessToken', () => {
      let result = validateTokens(null);
      assert.ok(result.error.message.includes('authentication token'));
    });
  });

  describe('device flow helpers', () => {
    it('normalizes snake_case and camelCase device flow responses', () => {
      assert.deepStrictEqual(
        normalizeDeviceFlowResponse({
          verification_uri: 'https://auth.test/device',
          user_code: 'A B',
          device_code: 'device-1',
        }),
        {
          verificationUri: 'https://auth.test/device',
          userCode: 'A B',
          deviceCode: 'device-1',
          urlWithCode: 'https://auth.test/device?code=A%20B',
        }
      );
      assert.deepStrictEqual(
        normalizeDeviceFlowResponse({
          verificationUri: 'https://auth.test/device',
          userCode: 'CODE',
          deviceCode: 'device-2',
        }).deviceCode,
        'device-2'
      );
      assert.throws(
        () => normalizeDeviceFlowResponse({}),
        /Invalid device flow response/
      );
    });

    it('resolves authorization responses into tokens or user-facing errors', () => {
      let authorized = { tokens: { accessToken: 'token' } };
      let snakeCaseAuthorized = { tokens: { access_token: 'token' } };

      assert.strictEqual(resolveAuthorizedTokenData(authorized), authorized);
      assert.strictEqual(
        resolveAuthorizedTokenData(snakeCaseAuthorized),
        snakeCaseAuthorized
      );
      assert.throws(
        () => resolveAuthorizedTokenData({ status: 'pending' }),
        /Authorization not complete/
      );
      assert.throws(
        () => resolveAuthorizedTokenData({ status: 'expired' }),
        /Device code expired/
      );
      assert.throws(
        () => resolveAuthorizedTokenData({ status: 'denied' }),
        /Authorization denied/
      );
    });

    it('builds stored tokens deterministically', () => {
      let now = Date.parse('2026-05-18T12:00:00.000Z');

      assert.deepStrictEqual(
        buildTokens(
          {
            tokens: {
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              expires_in: 3600,
            },
            user: { email: 'robert@example.test' },
            organizations: [{ slug: 'vizzly' }],
          },
          now
        ),
        {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: '2026-05-18T13:00:00.000Z',
          user: { email: 'robert@example.test' },
          organizations: [{ slug: 'vizzly' }],
        }
      );
    });
  });
});
