import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseProjectSelector,
  projectLinkCommand,
  validateProjectLinkOptions,
} from '../../src/commands/project.js';

function createOutput() {
  let calls = [];
  return {
    calls,
    configure: options => calls.push({ method: 'configure', args: [options] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    complete: message => calls.push({ method: 'complete', args: [message] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    data: value => calls.push({ method: 'data', args: [value] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

describe('commands/project', () => {
  describe('parseProjectSelector', () => {
    it('parses org/project shorthand and option fallbacks', () => {
      assert.deepStrictEqual(parseProjectSelector('vizzly/storybook'), {
        organizationSlug: 'vizzly',
        projectSlug: 'storybook',
      });
      assert.deepStrictEqual(
        parseProjectSelector('storybook', { org: 'vizzly' }),
        {
          organizationSlug: 'vizzly',
          projectSlug: 'storybook',
        }
      );
    });
  });

  describe('validateProjectLinkOptions', () => {
    it('requires both organization and project', () => {
      assert.deepStrictEqual(
        validateProjectLinkOptions('vizzly/storybook'),
        []
      );
      assert.deepStrictEqual(
        validateProjectLinkOptions(null, { org: 'vizzly' }),
        ['Project is required. Use <org>/<project> or --project <slug>.']
      );
    });
  });

  describe('projectLinkCommand', () => {
    it('links a project with user auth and stores only the scoped upload credential', async () => {
      let output = createOutput();
      let capturedRequest = null;
      let savedLink = null;

      await projectLinkCommand(
        'vizzly/storybook',
        { name: 'Local Link' },
        {},
        {
          output,
          loadConfig: async () => ({
            apiUrl: 'https://app.vizzly.dev',
            userToken: 'user-jwt',
          }),
          getAccessToken: async () => {
            throw new Error('config user token should be used first');
          },
          createApiClient: ({ token }) => ({
            request: async (endpoint, options) => {
              capturedRequest = { endpoint, options, token };
              return {
                organization: { slug: 'vizzly', name: 'Vizzly' },
                project: { slug: 'storybook', name: 'Storybook' },
                token: {
                  id: 'token-id',
                  token: 'vzt_secret',
                  token_prefix: 'vzt_sec',
                  created_at: '2026-05-20T12:00:00.000Z',
                  expires_at: null,
                },
              };
            },
          }),
          saveProjectLink: async link => {
            savedLink = link;
            return {
              ...link,
              storage: 'keychain',
            };
          },
        }
      );

      assert.strictEqual(capturedRequest.token, 'user-jwt');
      assert.strictEqual(
        capturedRequest.endpoint,
        '/api/cli/storybook/link-token'
      );
      assert.strictEqual(
        capturedRequest.options.headers['X-Organization'],
        'vizzly'
      );
      assert.deepStrictEqual(JSON.parse(capturedRequest.options.body), {
        name: 'Local Link',
      });
      assert.strictEqual(savedLink.token, 'vzt_secret');
      assert.strictEqual(savedLink.organizationSlug, 'vizzly');
      assert.strictEqual(savedLink.projectSlug, 'storybook');
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Linked vizzly/storybook'
        )
      );
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] === 'Active project: vizzly/storybook'
        )
      );
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] === 'Credential storage: keychain'
        )
      );
    });

    it('passes expiresAt through to the project link API', async () => {
      let output = createOutput();
      let capturedRequest = null;

      await projectLinkCommand(
        'vizzly/storybook',
        {
          name: 'Expiring Link',
          expiresAt: '2026-06-01T00:00:00.000Z',
        },
        {},
        {
          output,
          loadConfig: async () => ({
            apiUrl: 'https://app.vizzly.dev',
            userToken: 'user-jwt',
          }),
          createApiClient: () => ({
            request: async (endpoint, options) => {
              capturedRequest = { endpoint, options };
              return {
                organization: { slug: 'vizzly', name: 'Vizzly' },
                project: { slug: 'storybook', name: 'Storybook' },
                token: {
                  id: 'token-id',
                  token: 'vzt_secret',
                  token_prefix: 'vzt_sec',
                  created_at: '2026-05-20T12:00:00.000Z',
                  expires_at: '2026-06-01T00:00:00.000Z',
                },
              };
            },
          }),
          saveProjectLink: async link => ({
            ...link,
            storage: 'keychain',
          }),
        }
      );

      assert.deepStrictEqual(JSON.parse(capturedRequest.options.body), {
        name: 'Expiring Link',
        expiresAt: '2026-06-01T00:00:00.000Z',
      });
    });

    it('uses the global token override for project link requests', async () => {
      let output = createOutput();
      let capturedToken = null;

      await projectLinkCommand(
        'vizzly/storybook',
        {},
        { token: 'cli-token' },
        {
          output,
          loadConfig: async (_configPath, cliOverrides) => {
            assert.strictEqual(cliOverrides.token, 'cli-token');
            return { apiUrl: 'https://app.vizzly.dev' };
          },
          getAccessToken: async () => {
            throw new Error('CLI token should be used before saved login');
          },
          createApiClient: ({ token }) => ({
            request: async () => {
              capturedToken = token;
              return {
                organization: { slug: 'vizzly', name: 'Vizzly' },
                project: { slug: 'storybook', name: 'Storybook' },
                token: {
                  id: 'token-id',
                  token: 'vzt_secret',
                  token_prefix: 'vzt_sec',
                  created_at: '2026-05-20T12:00:00.000Z',
                  expires_at: null,
                },
              };
            },
          }),
          saveProjectLink: async link => ({
            ...link,
            storage: 'keychain',
          }),
        }
      );

      assert.strictEqual(capturedToken, 'cli-token');
    });

    it('asks the user to login before linking', async () => {
      let output = createOutput();
      let exitCode = null;

      await projectLinkCommand(
        'vizzly/storybook',
        {},
        {},
        {
          output,
          loadConfig: async () => ({ apiUrl: 'https://app.vizzly.dev' }),
          getAccessToken: async () => null,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'hint' &&
            call.args[0] ===
              'Run "vizzly login" first, then try project link again'
        )
      );
    });
  });
});
