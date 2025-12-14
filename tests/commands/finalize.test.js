import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  finalizeCommand,
  validateFinalizeOptions,
} from '../../src/commands/finalize.js';

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
    success: msg => calls.push({ method: 'success', args: [msg] }),
    data: d => calls.push({ method: 'data', args: [d] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

describe('commands/finalize', () => {
  describe('validateFinalizeOptions', () => {
    it('returns no errors for valid parallel ID', () => {
      let errors = validateFinalizeOptions('parallel-123', {});
      assert.deepStrictEqual(errors, []);
    });

    it('returns error for empty parallel ID', () => {
      let errors = validateFinalizeOptions('', {});
      assert.deepStrictEqual(errors, ['Parallel ID is required']);
    });

    it('returns error for whitespace parallel ID', () => {
      let errors = validateFinalizeOptions('   ', {});
      assert.deepStrictEqual(errors, ['Parallel ID is required']);
    });

    it('returns error for null parallel ID', () => {
      let errors = validateFinalizeOptions(null, {});
      assert.deepStrictEqual(errors, ['Parallel ID is required']);
    });

    it('returns error for undefined parallel ID', () => {
      let errors = validateFinalizeOptions(undefined, {});
      assert.deepStrictEqual(errors, ['Parallel ID is required']);
    });
  });

  describe('finalizeCommand', () => {
    it('returns error when no API key', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: null,
            apiUrl: 'https://api.test',
          }),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reason, 'no-api-key');
      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('calls finalizeParallelBuild with correct params', async () => {
      let output = createMockOutput();
      let capturedClient = null;
      let capturedParallelId = null;

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: opts => {
            capturedClient = opts;
            return { request: async () => ({}) };
          },
          finalizeParallelBuild: async (client, parallelId) => {
            capturedParallelId = parallelId;
            return {
              build: {
                id: 'build-456',
                status: 'completed',
                parallel_id: 'parallel-123',
              },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(capturedParallelId, 'parallel-123');
      assert.strictEqual(capturedClient.token, 'test-token');
      assert.strictEqual(capturedClient.command, 'finalize');
    });

    it('outputs JSON when json flag is set', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => ({
            build: {
              id: 'build-456',
              status: 'completed',
              parallel_id: 'parallel-123',
            },
          }),
          output,
          exit: () => {},
        }
      );

      assert.ok(output.calls.some(c => c.method === 'data'));
      assert.ok(!output.calls.some(c => c.method === 'success'));
    });

    it('outputs success message when not JSON mode', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        { json: false },
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => ({
            build: {
              id: 'build-456',
              status: 'completed',
              parallel_id: 'parallel-123',
            },
          }),
          output,
          exit: () => {},
        }
      );

      assert.ok(output.calls.some(c => c.method === 'success'));
      assert.ok(output.calls.some(c => c.method === 'info'));
    });

    it('shows verbose output when verbose flag is set', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        { verbose: true },
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => ({
            build: {
              id: 'build-456',
              status: 'completed',
              parallel_id: 'parallel-123',
            },
          }),
          output,
          exit: () => {},
        }
      );

      assert.ok(output.calls.some(c => c.method === 'debug'));
    });

    it('handles API errors gracefully', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => {
            throw new Error('API error');
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'stopSpinner'));
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('always calls cleanup', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => ({
            build: {
              id: 'build-456',
              status: 'completed',
              parallel_id: 'parallel-123',
            },
          }),
          output,
          exit: () => {},
        }
      );

      assert.ok(output.calls.some(c => c.method === 'cleanup'));
    });

    it('merges options and globalOptions for config', async () => {
      let output = createMockOutput();
      let capturedConfigPath = null;
      let capturedOptions = null;

      await finalizeCommand(
        'parallel-123',
        { token: 'option-token' },
        { config: '/path/to/config', verbose: true },
        {
          loadConfig: async (configPath, options) => {
            capturedConfigPath = configPath;
            capturedOptions = options;
            return { apiKey: 'test-token', apiUrl: 'https://api.test' };
          },
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => ({
            build: { id: 'b', status: 'done', parallel_id: 'p' },
          }),
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedConfigPath, '/path/to/config');
      assert.strictEqual(capturedOptions.token, 'option-token');
      assert.strictEqual(capturedOptions.verbose, true);
    });
  });
});
