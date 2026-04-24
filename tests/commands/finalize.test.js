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
    warn: msg => calls.push({ method: 'warn', args: [msg] }),
    success: msg => calls.push({ method: 'success', args: [msg] }),
    data: d => calls.push({ method: 'data', args: [d] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    // TUI helpers
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    complete: (msg, opts) =>
      calls.push({ method: 'complete', args: [msg, opts] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
  };
}

function createMockConfig(overrides = {}) {
  return {
    apiKey: 'test-token',
    apiUrl: 'https://api.test',
    target: {
      organizationSlug: 'acme',
      projectSlug: 'marketing-site',
    },
    ...overrides,
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

    it('returns error for --project without --org', () => {
      let errors = validateFinalizeOptions('parallel-123', {
        project: 'web-app',
      });
      assert.deepStrictEqual(errors, [
        '--project requires --org. Pass both --org and --project, or use --project-id.',
      ]);
    });

    it('returns error for --org without --project', () => {
      let errors = validateFinalizeOptions('parallel-123', { org: 'acme' });
      assert.deepStrictEqual(errors, [
        '--org requires --project. Pass both --org and --project, or use --project-id.',
      ]);
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

    it('returns error when target cannot be resolved for user auth', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () =>
            createMockConfig({ apiKey: 'user-token', target: undefined }),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(exitCode, 1);
      assert.ok(
        output.calls.some(
          c =>
            c.method === 'error' &&
            c.args[0] === 'Failed to finalize parallel build' &&
            c.args[1]?.message?.includes('This command needs a target project')
        )
      );
    });

    it('calls finalizeParallelBuild with correct params', async () => {
      let output = createMockOutput();
      let capturedClient = null;
      let capturedParallelId = null;
      let capturedOptions = null;

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => createMockConfig({ apiKey: 'user-token' }),
          createApiClient: opts => {
            capturedClient = opts;
            return { request: async () => ({}) };
          },
          finalizeParallelBuild: async (_client, parallelId, options) => {
            capturedParallelId = parallelId;
            capturedOptions = options;
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
      assert.strictEqual(capturedClient.token, 'user-token');
      assert.strictEqual(capturedClient.command, 'finalize');
      assert.deepStrictEqual(capturedOptions, {
        target: {
          organizationSlug: 'acme',
          projectSlug: 'marketing-site',
        },
      });
    });

    it('keeps project token finalize working without an explicit target', async () => {
      let output = createMockOutput();
      let capturedOptions = null;

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () =>
            createMockConfig({
              apiKey: 'vzt_project-token',
              target: undefined,
            }),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async (_client, _parallelId, options) => {
            capturedOptions = options;
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
      assert.deepStrictEqual(capturedOptions, { target: undefined });
    });

    it('outputs JSON when json flag is set', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        { json: true },
        {
          loadConfig: async () => createMockConfig(),
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
      // In JSON mode, no header/complete messages are shown
      assert.ok(!output.calls.some(c => c.method === 'complete'));
    });

    it('outputs success message when not JSON mode', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        { json: false },
        {
          loadConfig: async () => createMockConfig(),
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

      // Now uses output.complete() instead of output.success()
      assert.ok(output.calls.some(c => c.method === 'complete'));
      // Now uses keyValue for build details instead of info
      assert.ok(output.calls.some(c => c.method === 'keyValue'));
    });

    it('shows verbose output when verbose flag is set', async () => {
      let output = createMockOutput();

      await finalizeCommand(
        'parallel-123',
        {},
        { verbose: true },
        {
          loadConfig: async () => createMockConfig(),
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
          loadConfig: async () => createMockConfig(),
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
          loadConfig: async () => createMockConfig(),
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
            return createMockConfig();
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

    it('does not fail CI when API returns 5xx error', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error('API request failed: 502 - Bad Gateway');
      apiError.context = { status: 502 };

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => {
            throw apiError;
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.skipped, true);
      assert.strictEqual(result.result.reason, 'api-unavailable');
      assert.strictEqual(exitCode, null);
      assert.ok(
        output.calls.some(
          c => c.method === 'warn' && c.args[0].includes('API unavailable')
        )
      );
    });

    it('does not fail CI on 5xx even with --strict flag', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error('API request failed: 503 - Service Unavailable');
      apiError.context = { status: 503 };

      let result = await finalizeCommand(
        'parallel-123',
        {},
        { strict: true },
        {
          loadConfig: async () => createMockConfig(),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => {
            throw apiError;
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      // 5xx errors should ALWAYS be resilient, even with --strict
      // Infrastructure issues are out of user's control
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.skipped, true);
      assert.strictEqual(result.result.reason, 'api-unavailable');
      assert.strictEqual(exitCode, null);
    });

    it('does not fail CI when no build found (404) in non-strict mode', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error('API request failed: 404 - Not Found');
      apiError.context = { status: 404 };

      let result = await finalizeCommand(
        'parallel-123',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => {
            throw apiError;
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.skipped, true);
      assert.strictEqual(result.result.reason, 'no-build-found');
      assert.strictEqual(exitCode, null);
      assert.ok(
        output.calls.some(
          c => c.method === 'warn' && c.args[0].includes('No build found')
        )
      );
    });

    it('fails CI when no build found (404) in strict mode', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error('API request failed: 404 - Not Found');
      apiError.context = { status: 404 };

      let result = await finalizeCommand(
        'parallel-123',
        {},
        { strict: true },
        {
          loadConfig: async () => createMockConfig(),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => {
            throw apiError;
          },
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reason, 'no-build-found');
      assert.strictEqual(exitCode, 1);
      assert.ok(
        output.calls.some(
          c => c.method === 'error' && c.args[0].includes('No build found')
        )
      );
    });

    it('shows verbose hints when no build found in non-strict mode', async () => {
      let output = createMockOutput();

      let apiError = new Error('API request failed: 404 - Not Found');
      apiError.context = { status: 404 };

      await finalizeCommand(
        'parallel-123',
        {},
        { verbose: true },
        {
          loadConfig: async () => createMockConfig(),
          createApiClient: () => ({ request: async () => ({}) }),
          finalizeParallelBuild: async () => {
            throw apiError;
          },
          output,
          exit: () => {},
        }
      );

      // Should show helpful hints in verbose mode
      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('Possible reasons')
        )
      );
      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('--strict')
        )
      );
    });
  });
});
