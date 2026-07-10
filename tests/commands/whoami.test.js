import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTokenExpiryStatus,
  validateWhoamiOptions,
  whoamiCommand,
} from '../../src/commands/whoami.js';

function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    header: command => calls.push({ method: 'header', args: [command] }),
    print: message => calls.push({ method: 'print', args: [message] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    warn: message => calls.push({ method: 'warn', args: [message] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    keyValue: values => calls.push({ method: 'keyValue', args: [values] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    list: items => calls.push({ method: 'list', args: [items] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

let auth = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: '2026-05-19T12:00:00.000Z',
};

let response = {
  user: {
    id: 'user-1',
    name: 'Robert',
    username: 'rob',
    email: 'rob@example.com',
  },
  organizations: [
    {
      id: 'org-1',
      name: 'Vizzly',
      slug: 'vizzly',
      role: 'owner',
    },
  ],
};

describe('commands/whoami', () => {
  describe('validateWhoamiOptions', () => {
    it('returns no errors', () => {
      assert.deepStrictEqual(validateWhoamiOptions({}), []);
    });
  });

  describe('getTokenExpiryStatus', () => {
    it('formats expired tokens with a refresh hint', () => {
      let result = getTokenExpiryStatus(
        '2026-05-18T11:59:00.000Z',
        new Date('2026-05-18T12:00:00.000Z')
      );

      assert.deepStrictEqual(result, {
        level: 'warn',
        message: 'Token has expired',
        refreshHint: 'Run "vizzly login" to refresh your authentication',
      });
    });

    it('formats hour-level expiry', () => {
      let result = getTokenExpiryStatus(
        '2026-05-18T14:00:00.000Z',
        new Date('2026-05-18T12:00:00.000Z')
      );

      assert.deepStrictEqual(result, {
        level: 'hint',
        message: 'Token expires in 2 hours',
      });
    });

    it('formats less-than-minute expiry with a refresh hint', () => {
      let result = getTokenExpiryStatus(
        '2026-05-18T12:00:30.000Z',
        new Date('2026-05-18T12:00:00.000Z')
      );

      assert.deepStrictEqual(result, {
        level: 'warn',
        message: 'Token expires in less than a minute',
        refreshHint: 'Run "vizzly login" to refresh your authentication',
      });
    });
  });

  describe('whoamiCommand', () => {
    it('returns unauthenticated JSON when no token is stored', async () => {
      let output = createMockOutput();

      await whoamiCommand(
        {},
        { json: true },
        {
          getAuthTokens: async () => null,
          output,
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], { authenticated: false });
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });

    it('fetches user info with the configured auth client', async () => {
      let output = createMockOutput();
      let capturedBaseUrl = null;
      let capturedTokenStore = null;

      await whoamiCommand(
        { apiUrl: 'https://api.example.test' },
        { json: true },
        {
          getAuthTokens: async () => auth,
          createAuthClient: ({ baseUrl }) => {
            capturedBaseUrl = baseUrl;
            return { kind: 'client' };
          },
          createTokenStore: () => ({ kind: 'store' }),
          whoami: async (_client, tokenStore) => {
            capturedTokenStore = tokenStore;
            return response;
          },
          output,
        }
      );

      assert.strictEqual(capturedBaseUrl, 'https://api.example.test');
      assert.deepStrictEqual(capturedTokenStore, { kind: 'store' });

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].authenticated, true);
      assert.deepStrictEqual(dataCall.args[0].user, response.user);
      assert.deepStrictEqual(
        dataCall.args[0].organizations,
        response.organizations
      );
      assert.strictEqual(dataCall.args[0].tokenExpiresAt, auth.expiresAt);
    });

    it('uses the API URL stored with the login', async () => {
      let capturedBaseUrl = null;

      await whoamiCommand(
        {},
        { json: true },
        {
          getAuthTokens: async () => ({
            ...auth,
            apiUrl: 'http://localhost:3000',
          }),
          getApiUrl: () => 'https://app.vizzly.dev',
          createAuthClient: ({ baseUrl }) => {
            capturedBaseUrl = baseUrl;
            return {};
          },
          createTokenStore: () => ({}),
          whoami: async () => response,
          output: createMockOutput(),
        }
      );

      assert.strictEqual(capturedBaseUrl, 'http://localhost:3000');
    });

    it('prints human-readable user and organization information', async () => {
      let output = createMockOutput();

      await whoamiCommand(
        {},
        { verbose: true },
        {
          getAuthTokens: async () => auth,
          getApiUrl: () => 'https://api.test',
          createAuthClient: () => ({}),
          createTokenStore: () => ({}),
          whoami: async () => response,
          output,
        }
      );

      let keyValueCall = output.calls.find(call => call.method === 'keyValue');
      assert.strictEqual(keyValueCall.args[0].User, 'Robert');
      assert.strictEqual(keyValueCall.args[0].Email, 'rob@example.com');
      assert.strictEqual(keyValueCall.args[0]['User ID'], 'user-1');

      let listCall = output.calls.find(call => call.method === 'list');
      assert.deepStrictEqual(listCall.args[0], ['Vizzly @vizzly [owner]']);
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'hint' && call.args[0].includes('Token expires')
        )
      );
    });

    it('reports auth errors and exits with status 1', async () => {
      let output = createMockOutput();
      let exitCode = null;
      let error = new Error('expired');
      error.name = 'AuthError';

      await whoamiCommand(
        {},
        { json: true },
        {
          getAuthTokens: async () => auth,
          createAuthClient: () => ({}),
          createTokenStore: () => ({}),
          whoami: async () => {
            throw error;
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        authenticated: false,
        error: 'expired',
      });
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });
  });
});
