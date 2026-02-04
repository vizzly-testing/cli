import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  comparisonsCommand,
  validateComparisonsOptions,
} from '../../src/commands/comparisons.js';

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
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
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

describe('commands/comparisons', () => {
  describe('validateComparisonsOptions', () => {
    it('returns no errors for valid options', () => {
      let errors = validateComparisonsOptions({ limit: 50, offset: 0 });
      assert.deepStrictEqual(errors, []);
    });

    it('returns error for invalid limit', () => {
      let errors = validateComparisonsOptions({ limit: 500 });
      assert.ok(errors.includes('--limit must be a number between 1 and 250'));
    });

    it('returns error for negative offset', () => {
      let errors = validateComparisonsOptions({ offset: -1 });
      assert.ok(errors.includes('--offset must be a non-negative number'));
    });
  });

  describe('comparisonsCommand', () => {
    it('requires API token', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await comparisonsCommand(
        { build: 'test' },
        {},
        {
          loadConfig: async () => ({}),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('requires build, id, or name option', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await comparisonsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(
        output.calls.some(
          c => c.method === 'error' && c.args[0].includes('--build')
        )
      );
    });

    it('fetches comparisons for build with JSON output', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          { id: 'comp-1', name: 'button-primary', status: 'identical' },
          { id: 'comp-2', name: 'button-secondary', status: 'changed' },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1' },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].buildId, 'build-1');
      assert.strictEqual(dataCall.args[0].comparisons.length, 2);
      assert.strictEqual(dataCall.args[0].summary.passed, 1);
      assert.strictEqual(dataCall.args[0].summary.failed, 1);
    });

    it('searches comparisons by name', async () => {
      let output = createMockOutput();
      let capturedName = null;
      let mockComparisons = [
        {
          id: 'comp-1',
          name: 'button-primary',
          status: 'identical',
          build_id: 'b1',
        },
      ];

      await comparisonsCommand(
        { name: 'button-*' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          searchComparisons: async (_client, name) => {
            capturedName = name;
            return {
              comparisons: mockComparisons,
              pagination: { total: 1, hasMore: false },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedName, 'button-*');
      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].comparisons.length, 1);
    });

    it('filters comparisons by status', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          { id: 'comp-1', name: 'button-primary', status: 'identical' },
          { id: 'comp-2', name: 'button-secondary', status: 'changed' },
          { id: 'comp-3', name: 'button-tertiary', status: 'identical' },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1', status: 'changed' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      // Only the 'changed' comparison should be returned
      assert.strictEqual(dataCall.args[0].comparisons.length, 1);
      assert.strictEqual(
        dataCall.args[0].comparisons[0].name,
        'button-secondary'
      );
    });

    it('fetches single comparison by ID', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'changed',
        diff_percentage: 0.05,
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].id, 'comp-1');
      assert.strictEqual(dataCall.args[0].name, 'button-primary');
    });
  });
});
