import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTokens,
  getTokenExpiryHint,
  loginCommand,
  normalizeDeviceFlowResponse,
  resolveAuthorizedTokenData,
  validateLoginOptions,
} from '../../src/commands/login.js';

function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    header: command => calls.push({ method: 'header', args: [command] }),
    printBox: (lines, options) =>
      calls.push({ method: 'printBox', args: [lines, options] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    complete: message => calls.push({ method: 'complete', args: [message] }),
    warn: message => calls.push({ method: 'warn', args: [message] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    keyValue: value => calls.push({ method: 'keyValue', args: [value] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    list: items => calls.push({ method: 'list', args: [items] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    getColors: () => ({
      bold: value => value,
      brand: {
        amber: value => value,
        info: value => value,
      },
    }),
  };
}

function createLoginHarness({ browserOpened = true, pollResponse } = {}) {
  let output = createMockOutput();
  let authClientConfig = null;
  let completedTokens = null;
  let polledDeviceCode = null;
  let exitCode = null;
  let waitCount = 0;

  return {
    output,
    get authClientConfig() {
      return authClientConfig;
    },
    get completedTokens() {
      return completedTokens;
    },
    get polledDeviceCode() {
      return polledDeviceCode;
    },
    get exitCode() {
      return exitCode;
    },
    get waitCount() {
      return waitCount;
    },
    deps: {
      completeDeviceFlow: async (_tokenStore, tokens) => {
        completedTokens = tokens;
      },
      createAuthClient: config => {
        authClientConfig = config;
        return { kind: 'auth-client' };
      },
      createTokenStore: () => ({ kind: 'token-store' }),
      getApiUrl: () => 'https://api.default.test',
      initiateDeviceFlow: async () => ({
        verification_uri: 'https://auth.example.test/device',
        user_code: 'ABCD-EFGH',
        device_code: 'device-code-1',
      }),
      now: () => Date.parse('2026-05-18T12:00:00.000Z'),
      openBrowser: async () => browserOpened,
      output,
      pollDeviceAuthorization: async (_client, deviceCode) => {
        polledDeviceCode = deviceCode;
        return (
          pollResponse || {
            tokens: {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              expiresIn: 86400,
            },
            user: {
              name: 'Robert',
              email: 'robert@example.test',
            },
            organizations: [{ name: 'Vizzly', slug: 'vizzly' }],
          }
        );
      },
      waitForEnter: async () => {
        waitCount += 1;
      },
      exit: code => {
        exitCode = code;
      },
    },
  };
}

describe('commands/login', () => {
  describe('validateLoginOptions', () => {
    it('returns no errors', () => {
      assert.deepStrictEqual(validateLoginOptions({}), []);
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

    it('builds stored tokens and expiry hints deterministically', () => {
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
      assert.strictEqual(
        getTokenExpiryHint('2026-05-20T12:00:00.000Z', now),
        'Token expires in 2 days'
      );
      assert.strictEqual(
        getTokenExpiryHint('2026-05-18T14:00:00.000Z', now),
        'Token expires in 2 hours'
      );
      assert.strictEqual(
        getTokenExpiryHint('2026-05-18T12:30:00.000Z', now),
        'Token expires in 30 minutes'
      );
    });
  });

  describe('loginCommand', () => {
    it('completes device login and stores tokens', async () => {
      let harness = createLoginHarness();

      await loginCommand(
        { apiUrl: 'https://api.override.test' },
        {},
        harness.deps
      );

      assert.deepStrictEqual(harness.authClientConfig, {
        baseUrl: 'https://api.override.test',
      });
      assert.strictEqual(harness.polledDeviceCode, 'device-code-1');
      assert.strictEqual(harness.waitCount, 1);
      assert.deepStrictEqual(harness.completedTokens, {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-05-19T12:00:00.000Z',
        apiUrl: 'https://api.override.test',
        user: {
          name: 'Robert',
          email: 'robert@example.test',
        },
        organizations: [{ name: 'Vizzly', slug: 'vizzly' }],
      });
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'complete' && call.args[0] === 'Authenticated'
        )
      );
      assert.ok(harness.output.calls.some(call => call.method === 'cleanup'));
    });

    it('shows a manual browser hint when browser open fails', async () => {
      let harness = createLoginHarness({ browserOpened: false });

      await loginCommand({}, {}, harness.deps);

      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'warn' &&
            call.args[0] === 'Could not open browser automatically'
        )
      );
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] === 'Please open the URL manually'
        )
      );
    });

    it('exits with a helpful message when authorization is still pending', async () => {
      let harness = createLoginHarness({
        pollResponse: { status: 'pending' },
      });

      await loginCommand({}, {}, harness.deps);

      assert.strictEqual(harness.exitCode, 1);
      assert.strictEqual(harness.completedTokens, null);
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'error' && call.args[0] === 'Login failed'
        )
      );
      assert.ok(harness.output.calls.some(call => call.method === 'cleanup'));
    });

    it('uses auth-specific recovery hints for auth errors', async () => {
      let harness = createLoginHarness();
      let authError = new Error('bad auth');
      authError.name = 'AuthError';
      harness.deps.initiateDeviceFlow = async () => {
        throw authError;
      };

      await loginCommand({}, {}, harness.deps);

      assert.strictEqual(harness.exitCode, 1);
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'error' && call.args[0] === 'Authentication failed'
        )
      );
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] ===
              "If you don't have an account, sign up at https://vizzly.dev"
        )
      );
    });

    it('uses rate-limit recovery hints for rate-limit errors', async () => {
      let harness = createLoginHarness();
      let rateLimitError = new Error('slow down');
      rateLimitError.code = 'RATE_LIMIT_ERROR';
      harness.deps.initiateDeviceFlow = async () => {
        throw rateLimitError;
      };

      await loginCommand({}, {}, harness.deps);

      assert.strictEqual(harness.exitCode, 1);
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'error' &&
            call.args[0] === 'Too many login attempts'
        )
      );
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] === 'Please wait a few minutes before trying again'
        )
      );
    });
  });
});
