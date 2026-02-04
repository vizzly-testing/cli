import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildsCommand, validateBuildsOptions } from '../../src/commands/builds.js';

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
    labelValue: (label, value) => calls.push({ method: 'labelValue', args: [label, value] }),
    keyValue: (data, opts) => calls.push({ method: 'keyValue', args: [data, opts] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    getColors: () => ({
      bold: s => s,
      dim: s => s,
      brand: {
        success: s => s,
        warning: s => s,
        error: s => s,
        info: s => s,
      },
    }),
  };
}

describe('commands/builds', () => {
  describe('validateBuildsOptions', () => {
    it('returns no errors for valid options', () => {
      let errors = validateBuildsOptions({ limit: 20, offset: 0 });
      assert.deepStrictEqual(errors, []);
    });

    it('returns error for invalid limit', () => {
      let errors = validateBuildsOptions({ limit: 500 });
      assert.ok(errors.includes('--limit must be a number between 1 and 250'));
    });

    it('returns error for negative offset', () => {
      let errors = validateBuildsOptions({ offset: -1 });
      assert.ok(errors.includes('--offset must be a non-negative number'));
    });
  });

  describe('buildsCommand', () => {
    it('requires API token', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await buildsCommand({}, {}, {
        loadConfig: async () => ({}),
        output,
        exit: code => { exitCode = code; },
      });

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('fetches builds list with JSON output', async () => {
      let output = createMockOutput();
      let mockBuilds = [
        {
          id: 'build-1',
          name: 'Build 1',
          status: 'completed',
          branch: 'main',
          commit_sha: 'abc1234',
          screenshot_count: 10,
        },
      ];

      await buildsCommand({}, { json: true }, {
        loadConfig: async () => ({ apiKey: 'test-token', apiUrl: 'https://api.test' }),
        createApiClient: () => ({}),
        getBuilds: async () => ({ builds: mockBuilds, pagination: { total: 1, hasMore: false } }),
        output,
        exit: () => {},
      });

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].builds.length, 1);
      assert.strictEqual(dataCall.args[0].builds[0].id, 'build-1');
    });

    it('fetches single build by ID', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        status: 'completed',
        branch: 'main',
      };

      await buildsCommand({ build: 'build-1' }, { json: true }, {
        loadConfig: async () => ({ apiKey: 'test-token', apiUrl: 'https://api.test' }),
        createApiClient: () => ({}),
        getBuild: async () => ({ build: mockBuild }),
        output,
        exit: () => {},
      });

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].id, 'build-1');
    });

    it('passes filters to API', async () => {
      let output = createMockOutput();
      let capturedFilters = null;

      await buildsCommand(
        { branch: 'main', status: 'completed', limit: 10 },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuilds: async (client, filters) => {
            capturedFilters = filters;
            return { builds: [], pagination: { total: 0, hasMore: false } };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedFilters.branch, 'main');
      assert.strictEqual(capturedFilters.status, 'completed');
      assert.strictEqual(capturedFilters.limit, 10);
    });
  });
});
