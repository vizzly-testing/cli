import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  statusCommand,
  validateStatusOptions,
} from '../../src/commands/status.js';

/**
 * Create mock output object that tracks calls
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    info: msg => calls.push({ method: 'info', args: [msg] }),
    debug: (msg, data) => calls.push({ method: 'debug', args: [msg, data] }),
    error: (msg, err) => calls.push({ method: 'error', args: [msg, err] }),
    warn: msg => calls.push({ method: 'warn', args: [msg] }),
    success: msg => calls.push({ method: 'success', args: [msg] }),
    data: d => calls.push({ method: 'data', args: [d] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    labelValue: (label, value, opts) =>
      calls.push({ method: 'labelValue', args: [label, value, opts] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: msg => calls.push({ method: 'hint', args: [msg] }),
    divider: () => calls.push({ method: 'divider', args: [] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    progressBar: () => '████████',
    link: (_label, url) => url,
    getColors: () => ({
      brand: {
        success: s => s,
        danger: s => s,
        warning: s => s,
        info: s => s,
        textMuted: s => s,
      },
    }),
  };
}

describe('commands/status', () => {
  describe('validateStatusOptions', () => {
    it('returns no errors for valid build ID', () => {
      let errors = validateStatusOptions('build-123');
      assert.deepStrictEqual(errors, []);
    });

    it('returns error for empty build ID', () => {
      let errors = validateStatusOptions('');
      assert.deepStrictEqual(errors, ['Build ID is required']);
    });

    it('returns error for whitespace build ID', () => {
      let errors = validateStatusOptions('   ');
      assert.deepStrictEqual(errors, ['Build ID is required']);
    });
  });

  describe('statusCommand', () => {
    it('does not fail CI when API returns 5xx error', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error(
        'API request failed: 500 - Internal Server Error'
      );
      apiError.context = { status: 500 };

      let result = await statusCommand(
        'build-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => {
            throw apiError;
          },
          getPreviewInfo: async () => null,
          getApiUrl: () => 'https://api.test',
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, null);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.skipped, true);
      assert.ok(
        output.calls.some(
          c => c.method === 'warn' && c.args[0].includes('API unavailable')
        )
      );
    });

    it('still fails for 4xx client errors', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error('API request failed: 404 - Not Found');
      apiError.context = { status: 404 };

      await statusCommand(
        'build-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => {
            throw apiError;
          },
          getPreviewInfo: async () => null,
          getApiUrl: () => 'https://api.test',
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });
  });
});
