import assert from 'node:assert';
import { describe, it } from 'node:test';
import { whoamiCommand } from '../../src/commands/whoami.js';

function createMockOutput() {
  let calls = [];

  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: data => calls.push({ method: 'data', args: [data] }),
    header: value => calls.push({ method: 'header', args: [value] }),
    print: value => calls.push({ method: 'print', args: [value] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: value => calls.push({ method: 'hint', args: [value] }),
    warn: value => calls.push({ method: 'warn', args: [value] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    list: value => calls.push({ method: 'list', args: [value] }),
    keyValue: value => calls.push({ method: 'keyValue', args: [value] }),
    startSpinner: value =>
      calls.push({ method: 'startSpinner', args: [value] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    error: (value, error) =>
      calls.push({ method: 'error', args: [value, error] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

describe('commands/whoami', () => {
  it('reports unauthenticated for the targeted apiUrl', async () => {
    let output = createMockOutput();
    let capturedApiUrl = null;

    await whoamiCommand(
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
      { authenticated: false }
    );
  });

  it('uses the targeted apiUrl scope for whoami requests', async () => {
    let output = createMockOutput();
    let capturedBaseUrl = null;
    let capturedTokenStoreApiUrl = null;

    await whoamiCommand(
      {},
      { json: true, apiUrl: 'http://localhost:3000' },
      {
        getAuthTokens: async apiUrl => ({
          accessToken: `token-for-${apiUrl}`,
          expiresAt: '2030-01-01T00:00:00.000Z',
        }),
        createAuthClient: ({ baseUrl }) => {
          capturedBaseUrl = baseUrl;
          return { baseUrl };
        },
        createTokenStore: apiUrl => {
          capturedTokenStoreApiUrl = apiUrl;
          return { apiUrl };
        },
        whoami: async (client, tokenStore) => {
          assert.deepStrictEqual(client, { baseUrl: 'http://localhost:3000' });
          assert.deepStrictEqual(tokenStore, {
            apiUrl: 'http://localhost:3000',
          });
          return {
            user: { email: 'test@example.com', name: 'Test User' },
            organizations: [{ name: 'Acme', slug: 'acme' }],
          };
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(capturedBaseUrl, 'http://localhost:3000');
    assert.strictEqual(capturedTokenStoreApiUrl, 'http://localhost:3000');

    let payload = output.calls.find(call => call.method === 'data')?.args[0];
    assert.strictEqual(payload.authenticated, true);
    assert.strictEqual(payload.user.email, 'test@example.com');
    assert.strictEqual(payload.organizations[0].slug, 'acme');
  });
});
