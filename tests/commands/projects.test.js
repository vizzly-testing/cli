import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  projectsCommand,
  validateProjectsOptions,
} from '../../src/commands/projects.js';

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

let mockProjects = [
  {
    id: 'proj-1',
    name: 'Frontend',
    slug: 'frontend',
    organizationName: 'Vizzly',
    organizationSlug: 'vizzly',
    buildCount: 100,
    created_at: '2024-01-01',
    updated_at: '2024-06-01',
  },
  {
    id: 'proj-2',
    name: 'Dashboard',
    slug: 'dashboard',
    organizationName: 'PitStop',
    organizationSlug: 'pitstop',
    buildCount: 50,
    created_at: '2024-02-01',
    updated_at: '2024-06-01',
  },
];

describe('commands/projects', () => {
  describe('validateProjectsOptions', () => {
    it('returns no errors', () => {
      let errors = validateProjectsOptions({});
      assert.deepStrictEqual(errors, []);
    });
  });

  describe('projectsCommand', () => {
    it('requires API token when no auth exists', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await projectsCommand(
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

      await projectsCommand(
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
            return {
              request: async () => ({
                projects: mockProjects,
                pagination: { total: 2, hasMore: false },
              }),
            };
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

      await projectsCommand(
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
            return {
              request: async () => ({
                projects: mockProjects,
                pagination: { total: 2, hasMore: false },
              }),
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedToken, 'env-token');
    });

    it('returns all projects in JSON output', async () => {
      let output = createMockOutput();

      await projectsCommand(
        {},
        { json: true },
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({
              projects: mockProjects,
              pagination: { total: 2, hasMore: false },
            }),
          }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].projects.length, 2);
      assert.strictEqual(dataCall.args[0].projects[0].name, 'Frontend');
      assert.strictEqual(
        dataCall.args[0].projects[1].organizationSlug,
        'pitstop'
      );
    });

    it('passes org filter as query param', async () => {
      let output = createMockOutput();
      let capturedEndpoint = null;

      await projectsCommand(
        { org: 'pitstop' },
        { json: true },
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async endpoint => {
              capturedEndpoint = endpoint;
              return { projects: [], pagination: { total: 0, hasMore: false } };
            },
          }),
          output,
          exit: () => {},
        }
      );

      assert.ok(capturedEndpoint.includes('organization=pitstop'));
    });

    it('displays projects in human-readable format', async () => {
      let output = createMockOutput();

      await projectsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({
              projects: mockProjects,
              pagination: { total: 2, hasMore: false },
            }),
          }),
          output,
          exit: () => {},
        }
      );

      let labelCall = output.calls.find(
        c => c.method === 'labelValue' && c.args[0] === 'Showing'
      );
      assert.ok(labelCall);
      assert.strictEqual(labelCall.args[1], '2 of 2');
    });

    it('handles empty projects', async () => {
      let output = createMockOutput();

      await projectsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({ projects: [], pagination: {} }),
          }),
          output,
          exit: () => {},
        }
      );

      let printCalls = output.calls.filter(c => c.method === 'print');
      assert.ok(printCalls.some(c => c.args[0].includes('No projects found')));
    });

    it('shows pagination hint when more results available', async () => {
      let output = createMockOutput();

      await projectsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          getAccessToken: async () => 'user-token',
          createApiClient: () => ({
            request: async () => ({
              projects: mockProjects,
              pagination: { total: 50, hasMore: true },
            }),
          }),
          output,
          exit: () => {},
        }
      );

      let hintCalls = output.calls.filter(c => c.method === 'hint');
      assert.ok(hintCalls.some(c => c.args[0].includes('--offset')));
    });
  });
});
