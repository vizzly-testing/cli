import assert from 'node:assert';
import { describe, it } from 'node:test';
import { logoutCommand } from '../../src/commands/logout.js';

function createMockOutput() {
  let calls = [];

  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: data => calls.push({ method: 'data', args: [data] }),
    header: value => calls.push({ method: 'header', args: [value] }),
    print: value => calls.push({ method: 'print', args: [value] }),
    startSpinner: value =>
      calls.push({ method: 'startSpinner', args: [value] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    complete: value => calls.push({ method: 'complete', args: [value] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: value => calls.push({ method: 'hint', args: [value] }),
    error: (value, error) =>
      calls.push({ method: 'error', args: [value, error] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

describe('commands/logout', () => {
  it('reports not logged in for the targeted apiUrl', async () => {
    let output = createMockOutput();
    let capturedApiUrl = null;

    await logoutCommand(
      {},
      { json: true, apiUrl: 'http://localhost:3000' },
      {
        getAuthTokens: async apiUrl => {
          capturedApiUrl = apiUrl;
          return null;
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(capturedApiUrl, 'http://localhost:3000');
    assert.deepStrictEqual(
      output.calls.find(call => call.method === 'data')?.args[0],
      { loggedOut: false, reason: 'not_logged_in' }
    );
  });

  it('logs out using the targeted apiUrl scope', async () => {
    let output = createMockOutput();
    let capturedBaseUrl = null;
    let capturedTokenStoreApiUrl = null;
    let logoutCalled = false;

    await logoutCommand(
      {},
      { apiUrl: 'http://localhost:3000' },
      {
        getAuthTokens: async apiUrl => ({
          accessToken: `token-for-${apiUrl}`,
          refreshToken: 'refresh-token',
        }),
        createAuthClient: ({ baseUrl }) => {
          capturedBaseUrl = baseUrl;
          return { baseUrl };
        },
        createTokenStore: apiUrl => {
          capturedTokenStoreApiUrl = apiUrl;
          return { apiUrl };
        },
        logout: async (client, tokenStore) => {
          logoutCalled = true;
          assert.deepStrictEqual(client, { baseUrl: 'http://localhost:3000' });
          assert.deepStrictEqual(tokenStore, {
            apiUrl: 'http://localhost:3000',
          });
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(logoutCalled, true);
    assert.strictEqual(capturedBaseUrl, 'http://localhost:3000');
    assert.strictEqual(capturedTokenStoreApiUrl, 'http://localhost:3000');
    assert.ok(output.calls.some(call => call.method === 'complete'));
  });
});
