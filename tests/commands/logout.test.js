import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  logoutCommand,
  validateLogoutOptions,
} from '../../src/commands/logout.js';

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
    complete: message => calls.push({ method: 'complete', args: [message] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

let auth = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
};

describe('commands/logout', () => {
  describe('validateLogoutOptions', () => {
    it('returns no errors', () => {
      assert.deepStrictEqual(validateLogoutOptions({}), []);
    });
  });

  describe('logoutCommand', () => {
    it('returns not_logged_in JSON when no token is stored', async () => {
      let output = createMockOutput();

      await logoutCommand(
        {},
        { json: true },
        {
          getAuthTokens: async () => null,
          output,
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        loggedOut: false,
        reason: 'not_logged_in',
      });
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });

    it('logs out with the configured auth client and token store', async () => {
      let output = createMockOutput();
      let capturedBaseUrl = null;
      let capturedTokenStore = null;

      await logoutCommand(
        { apiUrl: 'https://api.example.test' },
        { json: true },
        {
          getAuthTokens: async () => auth,
          createAuthClient: ({ baseUrl }) => {
            capturedBaseUrl = baseUrl;
            return { kind: 'client' };
          },
          createTokenStore: () => ({ kind: 'store' }),
          logout: async (_client, tokenStore) => {
            capturedTokenStore = tokenStore;
          },
          output,
        }
      );

      assert.strictEqual(capturedBaseUrl, 'https://api.example.test');
      assert.deepStrictEqual(capturedTokenStore, { kind: 'store' });

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], { loggedOut: true });
    });

    it('prints human-readable logout confirmation', async () => {
      let output = createMockOutput();

      await logoutCommand(
        {},
        {},
        {
          getAuthTokens: async () => auth,
          getApiUrl: () => 'https://api.test',
          createAuthClient: () => ({}),
          createTokenStore: () => ({}),
          logout: async () => {},
          output,
        }
      );

      assert.ok(
        output.calls.some(
          call => call.method === 'complete' && call.args[0] === 'Logged out'
        )
      );
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] === 'Run "vizzly login" to authenticate again'
        )
      );
    });

    it('reports logout failures and exits with status 1', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await logoutCommand(
        {},
        {},
        {
          getAuthTokens: async () => auth,
          createAuthClient: () => ({}),
          createTokenStore: () => ({}),
          logout: async () => {
            throw new Error('network failed');
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(call => call.method === 'error'));
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });
  });
});
