import assert from 'node:assert';
import { describe, it } from 'node:test';
import { orgsCommand, validateOrgsOptions } from '../../src/commands/orgs.js';

/**
 * Create mock output object that tracks calls
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    error: (msg, err) => calls.push({ method: 'error', args: [msg, err] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: msg => calls.push({ method: 'hint', args: [msg] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    getColors: () => ({
      bold: s => s,
      dim: s => s,
    }),
  };
}

let mockOrgs = [
  {
    id: 'org-1',
    name: 'Vizzly',
    slug: 'vizzly',
    role: 'owner',
    projectCount: 11,
    created_at: '2024-01-01',
  },
  {
    id: 'org-2',
    name: 'PitStop',
    slug: 'pitstop',
    role: 'member',
    projectCount: 3,
    created_at: '2024-02-01',
  },
];

describe('commands/orgs', () => {
  describe('validateOrgsOptions', () => {
    it('returns no errors', () => {
      let errors = validateOrgsOptions({});
      assert.deepStrictEqual(errors, []);
    });
  });

  describe('orgsCommand', () => {
    it('requires API token when no auth exists', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await orgsCommand(
        {},
        {},
        {
          loadConfig: async () => ({}),
          getAccessToken: async () => null,
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('prefers user auth token over project token', async () => {
      let output = createMockOutput();
      let capturedToken = null;

      await orgsCommand(
        {},
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'project-token',
            apiUrl: 'https://api.test',
          }),
          getAccessToken: async () => 'user-auth-token',
          createApiClient: ({ token }) => {
            capturedToken = token;
            return { request: async () => ({ organizations: mockOrgs }) };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedToken, 'user-auth-token');
    });

    it('falls back to config.apiKey when no user auth token', async () => {
      let output = createMockOutput();
      let capturedToken = null;

      await orgsCommand(
        {},
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'env-token',
            apiUrl: 'https://api.test',
          }),
          getAccessToken: async () => null,
          createApiClient: ({ token }) => {
            capturedToken = token;
            return { request: async () => ({ organizations: mockOrgs }) };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedToken, 'env-token');
    });

    it('returns all orgs in JSON output', async () => {
      let output = createMockOutput();

      await orgsCommand(
        {},
        { json: true },
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({ organizations: mockOrgs }),
          }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].count, 2);
      assert.strictEqual(dataCall.args[0].organizations.length, 2);
      assert.strictEqual(dataCall.args[0].organizations[0].name, 'Vizzly');
      assert.strictEqual(dataCall.args[0].organizations[1].name, 'PitStop');
    });

    it('displays orgs in human-readable format', async () => {
      let output = createMockOutput();

      await orgsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({ organizations: mockOrgs }),
          }),
          output,
          exit: () => {},
        }
      );

      let labelCall = output.calls.find(
        c => c.method === 'labelValue' && c.args[0] === 'Count'
      );
      assert.ok(labelCall);
      assert.strictEqual(labelCall.args[1], '2');
    });

    it('shows "via token" for token role', async () => {
      let output = createMockOutput();
      let tokenOrg = [{ ...mockOrgs[0], role: 'token' }];

      await orgsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({ organizations: tokenOrg }),
          }),
          output,
          exit: () => {},
        }
      );

      let printCalls = output.calls.filter(c => c.method === 'print');
      assert.ok(printCalls.some(c => c.args[0].includes('via token')));
    });

    it('handles empty organizations', async () => {
      let output = createMockOutput();

      await orgsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({ organizations: [] }),
          }),
          output,
          exit: () => {},
        }
      );

      let printCalls = output.calls.filter(c => c.method === 'print');
      assert.ok(
        printCalls.some(c => c.args[0].includes('No organizations found'))
      );
    });
  });
});
