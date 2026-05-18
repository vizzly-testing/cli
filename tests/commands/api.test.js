import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apiCommand,
  appendApiQuery,
  buildApiRequest,
  isAllowedPostEndpoint,
  normalizeApiEndpoint,
  normalizeApiMethod,
  parseApiHeaders,
  validateApiOptions,
  validateApiRequest,
} from '../../src/commands/api.js';

function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: value => calls.push({ method: 'data', args: [value] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    header: command => calls.push({ method: 'header', args: [command] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    print: message => calls.push({ method: 'print', args: [message] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

function createApiHarness(response = { ok: true }) {
  let output = createMockOutput();
  let clientConfig = null;
  let request = null;
  let exitCode = null;

  return {
    output,
    get clientConfig() {
      return clientConfig;
    },
    get request() {
      return request;
    },
    get exitCode() {
      return exitCode;
    },
    deps: {
      loadConfig: async () => ({
        apiKey: 'token-123',
        apiUrl: 'https://api.example.test',
      }),
      createApiClient: config => {
        clientConfig = config;
        return {
          request: async (endpoint, options) => {
            request = { endpoint, options };
            return response;
          },
        };
      },
      output,
      exit: code => {
        exitCode = code;
      },
    },
  };
}

describe('commands/api', () => {
  describe('request helpers', () => {
    it('normalizes endpoint and method inputs', () => {
      assert.strictEqual(normalizeApiEndpoint('sdk/builds'), '/api/sdk/builds');
      assert.strictEqual(
        normalizeApiEndpoint('/api/sdk/builds'),
        '/api/sdk/builds'
      );
      assert.strictEqual(normalizeApiMethod('post'), 'POST');
      assert.strictEqual(normalizeApiMethod(), 'GET');
    });

    it('parses headers and query parameters without losing separators', () => {
      assert.deepStrictEqual(
        parseApiHeaders(['X-Test: alpha:beta', 'Accept: application/json']),
        {
          'X-Test': 'alpha:beta',
          Accept: 'application/json',
        }
      );
      assert.strictEqual(
        appendApiQuery('/api/sdk/builds?existing=1', [
          'branch=feature/a=b',
          'limit=5',
        ]),
        '/api/sdk/builds?existing=1&branch=feature%2Fa%3Db&limit=5'
      );
    });

    it('allows only selected POST endpoints', () => {
      assert.strictEqual(
        isAllowedPostEndpoint('/api/sdk/comparisons/cmp-1/approve'),
        true
      );
      assert.strictEqual(
        isAllowedPostEndpoint('/api/sdk/comparisons/cmp-1/reject'),
        true
      );
      assert.strictEqual(
        isAllowedPostEndpoint('/api/sdk/builds/build-1/comments'),
        true
      );
      assert.strictEqual(isAllowedPostEndpoint('/api/sdk/builds'), false);
    });

    it('builds GET and POST request options', () => {
      assert.deepStrictEqual(
        buildApiRequest({
          endpoint: 'sdk/builds',
          options: {
            query: ['limit=5'],
            header: 'X-Test: yes',
          },
        }),
        {
          errors: [],
          method: 'GET',
          normalizedEndpoint: '/api/sdk/builds?limit=5',
          requestOptions: {
            method: 'GET',
            headers: { 'X-Test': 'yes' },
          },
        }
      );

      assert.deepStrictEqual(
        buildApiRequest({
          endpoint: '/api/sdk/comparisons/cmp-1/approve',
          options: { method: 'POST', data: '{"ok":true}' },
        }),
        {
          errors: [],
          method: 'POST',
          normalizedEndpoint: '/api/sdk/comparisons/cmp-1/approve',
          requestOptions: {
            method: 'POST',
            body: '{"ok":true}',
            headers: { 'Content-Type': 'application/json' },
          },
        }
      );
    });

    it('reports unsafe API requests', () => {
      assert.deepStrictEqual(
        validateApiRequest({
          endpoint: '/api/sdk/builds',
          method: 'POST',
        }),
        [
          'POST not allowed for /api/sdk/builds. Only approve, reject, and comment endpoints support POST.',
        ]
      );
      assert.deepStrictEqual(
        validateApiRequest({
          endpoint: '/api/sdk/builds',
          method: 'DELETE',
        }),
        [
          'Method DELETE not allowed. Use GET for queries or POST for approve/reject/comment.',
        ]
      );
    });
  });

  describe('validateApiOptions', () => {
    it('validates endpoint and method options', () => {
      assert.deepStrictEqual(validateApiOptions('/api/sdk/builds'), []);
      assert.deepStrictEqual(validateApiOptions(''), ['Endpoint is required']);
      assert.deepStrictEqual(validateApiOptions('   '), [
        'Endpoint is required',
      ]);
      assert.deepStrictEqual(
        validateApiOptions('/api/sdk/builds', { method: 'POST' }),
        [
          'POST not allowed for /api/sdk/builds. Only approve, reject, and comment endpoints support POST.',
        ]
      );
      assert.deepStrictEqual(
        validateApiOptions('/api/sdk/builds', { method: 'PATCH' }),
        [
          'Method PATCH not allowed. Use GET for queries or POST for approve/reject/comment.',
        ]
      );
    });
  });

  describe('apiCommand', () => {
    it('performs a GET request and returns JSON output', async () => {
      let harness = createApiHarness({ builds: [] });

      await apiCommand(
        'sdk/builds',
        { query: ['limit=5'] },
        { json: true },
        harness.deps
      );

      assert.deepStrictEqual(harness.clientConfig, {
        baseUrl: 'https://api.example.test',
        token: 'token-123',
        command: 'api',
      });
      assert.deepStrictEqual(harness.request, {
        endpoint: '/api/sdk/builds?limit=5',
        options: { method: 'GET' },
      });

      let dataCall = harness.output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        endpoint: '/api/sdk/builds?limit=5',
        method: 'GET',
        response: { builds: [] },
      });
    });

    it('performs an allowed POST request with headers and body', async () => {
      let harness = createApiHarness({ comparison: { id: 'cmp-1' } });

      await apiCommand(
        '/api/sdk/comparisons/cmp-1/approve',
        {
          method: 'POST',
          data: '{"comment":"LGTM"}',
          header: 'X-Trace: trace-1',
        },
        {},
        harness.deps
      );

      assert.deepStrictEqual(harness.request, {
        endpoint: '/api/sdk/comparisons/cmp-1/approve',
        options: {
          method: 'POST',
          body: '{"comment":"LGTM"}',
          headers: {
            'X-Trace': 'trace-1',
            'Content-Type': 'application/json',
          },
        },
      });
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'labelValue' && call.args[0] === 'Endpoint'
        )
      );
    });

    it('cleans up and exits when no API token is configured', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await apiCommand(
        '/api/sdk/builds',
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.example.test' }),
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

    it('blocks unsafe POST requests before creating a client', async () => {
      let output = createMockOutput();
      let exitCode = null;
      let createdClient = false;

      await apiCommand(
        '/api/sdk/builds',
        { method: 'POST', data: '{}' },
        {},
        {
          loadConfig: async () => ({
            apiKey: 'token-123',
            apiUrl: 'https://api.example.test',
          }),
          createApiClient: () => {
            createdClient = true;
            return {};
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.strictEqual(createdClient, false);
      assert.ok(output.calls.some(call => call.method === 'error'));
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });

    it('returns JSON failure details using normalized endpoint and method', async () => {
      let output = createMockOutput();
      let exitCode = null;
      let error = new Error('network failed');
      error.code = 'network_error';
      error.context = { status: 503 };

      await apiCommand(
        'sdk/builds',
        {},
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token-123',
            apiUrl: 'https://api.example.test',
          }),
          createApiClient: () => ({
            request: async () => {
              throw error;
            },
          }),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        endpoint: '/api/sdk/builds',
        method: 'GET',
        error: {
          message: 'network failed',
          code: 'network_error',
          status: 503,
        },
      });
    });
  });
});
