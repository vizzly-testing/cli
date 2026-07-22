import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  resolveBuildDisplayUrl,
  runCommand,
  validateRunOptions,
} from '../../src/commands/run.js';

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
    print: msg => calls.push({ method: 'print', args: [msg] }),
    data: d => calls.push({ method: 'data', args: [d] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    // TUI helpers
    complete: (msg, opts) =>
      calls.push({ method: 'complete', args: [msg, opts] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    labelValue: (label, value, opts) =>
      calls.push({ method: 'labelValue', args: [label, value, opts] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    link: (_label, url) => url, // Return the URL for testing
    getColors: () => ({
      brand: {
        textTertiary: s => s,
        success: s => s,
        warning: s => s,
        danger: s => s,
        error: s => s,
        info: s => s,
        textMuted: s => s,
      },
      white: s => s,
      cyan: s => s,
      success: s => s,
      info: s => s,
      dim: s => s,
      underline: s => s,
    }),
  };
}

/**
 * Create minimal mock config
 */
function createMockConfig(overrides = {}) {
  return {
    apiKey: 'test-token',
    apiUrl: 'https://api.test',
    server: { port: 47392, timeout: 30000 },
    build: { environment: 'test' },
    comparison: { threshold: 0.1 },
    ...overrides,
  };
}

describe('commands/run', () => {
  describe('resolveBuildDisplayUrl', () => {
    it('uses the API result URL when one is already present', async () => {
      let url = await resolveBuildDisplayUrl({
        result: {
          buildId: 'build-123',
          url: 'https://app.test/acme/web/builds/build-123',
        },
        config: createMockConfig(),
        createApiClient: () => {
          throw new Error('should not fetch token context');
        },
      });

      assert.strictEqual(url, 'https://app.test/acme/web/builds/build-123');
    });

    it('builds an organization/project URL from token context', async () => {
      let clientArgs;
      let url = await resolveBuildDisplayUrl({
        result: { buildId: 'build-123' },
        config: createMockConfig({
          apiUrl: 'https://api.test/api/v1',
          apiKey: 'token-123',
        }),
        createApiClient: args => {
          clientArgs = args;
          return { client: true };
        },
        getTokenContext: async client => {
          assert.deepStrictEqual(client, { client: true });
          return {
            organization: { slug: 'acme' },
            project: { slug: 'web' },
          };
        },
      });

      assert.deepStrictEqual(clientArgs, {
        baseUrl: 'https://api.test/api/v1',
        token: 'token-123',
        command: 'run',
      });
      assert.strictEqual(url, 'https://api.test/acme/web/builds/build-123');
    });

    it('falls back to the build URL when token context lookup fails', async () => {
      let url = await resolveBuildDisplayUrl({
        result: { buildId: 'build-123' },
        config: createMockConfig({
          apiUrl: 'https://api.test/api/v1',
          apiKey: 'token-123',
        }),
        createApiClient: () => ({ client: true }),
        getTokenContext: async () => {
          throw new Error('context unavailable');
        },
      });

      assert.strictEqual(url, 'https://api.test/builds/build-123');
    });

    it('returns undefined when no URL can be resolved without a token', async () => {
      let url = await resolveBuildDisplayUrl({
        result: { buildId: 'build-123' },
        config: createMockConfig({ apiKey: null }),
      });

      assert.strictEqual(url, undefined);
    });
  });

  describe('runCommand', () => {
    it('returns error when no API key and allowNoToken not set', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig({ apiKey: null }),
          output,
          exit: code => {
            exitCode = code;
          },
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reason, 'no-api-key');
      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('allows running without token when allowNoToken is set', async () => {
      let output = createMockOutput();
      let runTestsCalled = false;

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () =>
            createMockConfig({ apiKey: null, allowNoToken: true }),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async () => ({}),
          }),
          runTests: async () => {
            runTestsCalled = true;
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(runTestsCalled, true);
    });

    it('configures output with global options', async () => {
      let output = createMockOutput();

      await runCommand(
        'pnpm test',
        {},
        { json: true, verbose: true, noColor: true },
        {
          loadConfig: async () => createMockConfig({ apiKey: null }),
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      let configureCall = output.calls.find(c => c.method === 'configure');
      assert.ok(configureCall);
      assert.strictEqual(configureCall.args[0].json, true);
      assert.strictEqual(configureCall.args[0].verbose, true);
      assert.strictEqual(configureCall.args[0].color, false);
    });

    it('shows verbose output when verbose flag is set', async () => {
      let output = createMockOutput();

      await runCommand(
        'pnpm test',
        {},
        { verbose: true },
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async () => ({}),
          }),
          runTests: async () => ({ buildId: 'b-123', screenshotsCaptured: 5 }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.ok(output.calls.some(c => c.method === 'debug'));
      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('Token check')
        )
      );
    });

    it('handles successful test run', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async () => ({}),
          }),
          runTests: async () => ({
            buildId: 'build-123',
            screenshotsCaptured: 10,
            url: 'https://vizzly.dev/builds/123',
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test commit',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.buildId, 'build-123');
      // Now uses output.complete() instead of output.success()
      assert.ok(output.calls.some(c => c.method === 'complete'));
      // Now uses print for screenshot summary
      assert.ok(output.calls.some(c => c.method === 'print'));
      let contextCall = output.calls.find(
        call =>
          call.method === 'print' &&
          call.args[0].includes('vizzly context build build-123 --agent')
      );
      assert.ok(contextCall);
      assert.doesNotMatch(contextCall.args[0], /--json/);
    });

    it('handles test command failure with exit code', async () => {
      let output = createMockOutput();

      let error = new Error('Test command exited with code 2');
      error.code = 'TEST_COMMAND_FAILED';

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async () => {
            throw error;
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 2);
    });

    it('handles generic error during test run', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async () => {
            throw new Error('Something went wrong');
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    it('waits for build completion when --wait flag is set', async () => {
      let output = createMockOutput();
      let waitForBuildCalled = false;

      let result = await runCommand(
        'pnpm test',
        { wait: true },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async buildId => {
              waitForBuildCalled = true;
              assert.strictEqual(buildId, 'build-123');
              return {
                status: 'completed',
                failedComparisons: 0,
                passedComparisons: 5,
              };
            },
          }),
          runTests: async () => ({
            buildId: 'build-123',
            screenshotsCaptured: 5,
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(waitForBuildCalled, true);
      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('Waiting for build')
        )
      );
    });

    it('returns failure when wait mode has failed comparisons', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        { wait: true },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async () => ({
              status: 'completed',
              failedComparisons: 3,
              passedComparisons: 5,
            }),
          }),
          runTests: async () => ({
            buildId: 'build-123',
            screenshotsCaptured: 8,
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
      assert.ok(
        output.calls.some(
          c =>
            c.method === 'error' && c.args[0].includes('3 visual comparisons')
        )
      );
    });

    it('keeps passed tests separate from an unavailable API build status', async () => {
      let output = createMockOutput();
      let userTestsRan = false;

      let result = await runCommand(
        'pnpm test',
        { wait: true },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async () => {
              let error = new Error('Failed to check build status');
              error.code = 'BUILD_STATUS_FAILED';
              error.context = { status: 400 };
              throw error;
            },
          }),
          runTests: async () => {
            userTestsRan = true;
            return {
              buildId: 'build-123',
              screenshotsCaptured: 0,
            };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(userTestsRan, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.buildId, 'build-123');
      assert.strictEqual(result.result.status, null);
      assert.strictEqual(result.result.testsPassed, true);
      assert.deepStrictEqual(result.result.error, {
        code: 'BUILD_STATUS_FAILED',
        message: 'Failed to check build status',
      });
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'warn' &&
            call.args[0].includes('could not confirm the build status')
        )
      );
    });

    it('registers and removes process event listeners', async () => {
      let output = createMockOutput();
      let registeredEvents = [];
      let removedEvents = [];

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig({ apiKey: null }),
          output,
          exit: () => {},
          processOn: (event, handler) => {
            registeredEvents.push({ event, handler });
          },
          processRemoveListener: (event, handler) => {
            removedEvents.push({ event, handler });
          },
        }
      );

      assert.ok(registeredEvents.some(e => e.event === 'SIGINT'));
      assert.ok(registeredEvents.some(e => e.event === 'exit'));
      assert.ok(removedEvents.some(e => e.event === 'SIGINT'));
      assert.ok(removedEvents.some(e => e.event === 'exit'));
    });

    it('handles config loading error', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => {
            throw new Error('Config file not found');
          },
          output,
          exit: code => {
            exitCode = code;
          },
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(exitCode, 1);
    });

    it('passes minClusterSize from config to runOptions', async () => {
      // This test verifies the fix for issue #160
      let output = createMockOutput();
      let capturedRunOptions = null;

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () =>
            createMockConfig({
              comparison: { threshold: 2.0, minClusterSize: 5 },
            }),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ runOptions }) => {
            capturedRunOptions = runOptions;
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(
        capturedRunOptions.minClusterSize,
        5,
        'minClusterSize should be passed from config to runOptions'
      );
      assert.strictEqual(capturedRunOptions.threshold, 2.0);
    });

    it('uses provided git metadata options', async () => {
      let output = createMockOutput();
      let capturedRunOptions = null;

      await runCommand(
        'pnpm test',
        {
          branch: 'feature-branch',
          commit: 'def456',
          message: 'custom message',
          buildName: 'custom-build',
        },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ runOptions }) => {
            capturedRunOptions = runOptions;
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async branch => branch || 'default',
          detectCommit: async commit => commit || 'default',
          detectCommitMessage: async () => 'default message',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async name => name || 'default-name',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(capturedRunOptions.branch, 'feature-branch');
      assert.strictEqual(capturedRunOptions.commit, 'def456');
      assert.strictEqual(capturedRunOptions.message, 'custom message');
      assert.strictEqual(capturedRunOptions.buildName, 'custom-build');
    });

    it('uses configured build metadata when CLI overrides are absent', async () => {
      let output = createMockOutput();
      let capturedRunOptions = null;

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () =>
            createMockConfig({
              build: {
                name: 'Configured Run',
                branch: 'config-branch',
                commit: 'config-sha',
                message: 'Config message',
                environment: 'preview',
              },
            }),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ runOptions }) => {
            capturedRunOptions = runOptions;
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async branch => branch,
          detectCommit: async commit => commit,
          detectCommitMessage: async () => {
            throw new Error('should not detect message');
          },
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async name => name,
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(capturedRunOptions.branch, 'config-branch');
      assert.strictEqual(capturedRunOptions.commit, 'config-sha');
      assert.strictEqual(capturedRunOptions.message, 'Config message');
      assert.strictEqual(capturedRunOptions.buildName, 'Configured Run');
      assert.strictEqual(capturedRunOptions.environment, 'preview');
    });

    it('waits before emitting JSON when --wait and --json are combined', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        { wait: true },
        { json: true },
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({
            waitForBuild: async buildId => {
              assert.strictEqual(buildId, 'build-123');
              return {
                status: 'completed',
                build: { conclusion: 'review_required' },
                totalComparisons: 3,
                newComparisons: 1,
                failedComparisons: 2,
                identicalComparisons: 0,
                approvalStatus: 'pending',
              };
            },
          }),
          runTests: async () => ({
            buildId: 'build-123',
            screenshotsCaptured: 3,
            url: 'https://app.test/builds/build-123',
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'test-build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      let dataCalls = output.calls.filter(c => c.method === 'data');

      assert.strictEqual(dataCalls.length, 1);
      assert.strictEqual(dataCalls[0].args[0].status, 'completed');
      assert.strictEqual(dataCalls[0].args[0].conclusion, 'review_required');
      assert.deepStrictEqual(dataCalls[0].args[0].comparisons, {
        total: 3,
        new: 1,
        changed: 2,
        identical: 0,
      });
      assert.strictEqual(dataCalls[0].args[0].exitCode, 1);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    it('always calls cleanup', async () => {
      let output = createMockOutput();

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async () => ({ buildId: 'b-1', screenshotsCaptured: 1 }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.ok(output.calls.some(c => c.method === 'cleanup'));
    });

    it('invokes onBuildCreated callback', async () => {
      let output = createMockOutput();

      await runCommand(
        'pnpm test',
        {},
        { verbose: true },
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            // Simulate the callback being invoked
            deps.onBuildCreated({
              buildId: 'build-456',
              url: 'https://vizzly.dev/builds/456',
            });
            return { buildId: 'build-456', screenshotsCaptured: 3 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('build-456')
        )
      );
      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('Vizzly')
        )
      );
    });

    it('invokes onServerReady callback in verbose mode', async () => {
      let output = createMockOutput();

      await runCommand(
        'pnpm test',
        {},
        { verbose: true },
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            deps.onServerReady({ port: 47392 });
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.ok(
        output.calls.some(
          c => c.method === 'info' && c.args[0].includes('47392')
        )
      );
    });

    it('invokes onFinalizeFailed callback', async () => {
      let output = createMockOutput();

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            deps.onFinalizeFailed({
              buildId: 'build-789',
              error: 'Network error',
            });
            return { buildId: 'build-789', screenshotsCaptured: 1 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.ok(
        output.calls.some(
          c => c.method === 'warn' && c.args[0].includes('build-789')
        )
      );
    });

    it('handles TEST_COMMAND_INTERRUPTED error code', async () => {
      let output = createMockOutput();

      let error = new Error('Test interrupted');
      error.code = 'TEST_COMMAND_INTERRUPTED';

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async () => {
            throw error;
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    it('provides contextual error for build failures', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => {
            throw new Error('build creation failed');
          },
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(
        output.calls.some(
          c => c.method === 'error' && c.args[0].includes('Build creation')
        )
      );
    });

    it('provides contextual error for screenshot failures', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => {
            throw new Error('screenshot processing error');
          },
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(
        output.calls.some(
          c => c.method === 'error' && c.args[0].includes('Screenshot')
        )
      );
    });

    it('provides contextual error for server failures', async () => {
      let output = createMockOutput();

      let result = await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => {
            throw new Error('server startup failed');
          },
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(
        output.calls.some(
          c => c.method === 'error' && c.args[0].includes('Server startup')
        )
      );
    });

    it('SIGINT handler triggers cleanup and exit', async () => {
      let output = createMockOutput();
      let handlers = {};
      let exitCode = null;
      let serverStopped = false;

      // Start a run that will hang on runTests
      let runPromise = runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {
              serverStopped = true;
            },
          }),
          createUploader: () => ({}),
          runTests: async () => {
            // Simulate SIGINT during test run
            await handlers.SIGINT();
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: code => {
            exitCode = code;
          },
          processOn: (event, handler) => {
            handlers[event] = handler;
          },
          processRemoveListener: () => {},
        }
      );

      await runPromise;

      assert.strictEqual(exitCode, 1);
      assert.strictEqual(serverStopped, true);
      assert.ok(output.calls.some(c => c.method === 'cleanup'));
    });

    it('exit handler calls output.cleanup', async () => {
      let output = createMockOutput();
      let handlers = {};

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async () => {
            // Trigger exit handler during test
            handlers.exit();
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: (event, handler) => {
            handlers[event] = handler;
          },
          processRemoveListener: () => {},
        }
      );

      // exit handler should have been called, triggering cleanup
      assert.ok(output.calls.filter(c => c.method === 'cleanup').length >= 1);
    });

    it('cleanup kills test process if running', async () => {
      let output = createMockOutput();
      let handlers = {};
      let processKilled = false;

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            // Simulate spawning a process that's still running
            deps.spawn('echo', {});
            // Then trigger SIGINT
            await handlers.SIGINT();
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          spawn: () => ({
            killed: false,
            kill: signal => {
              processKilled = true;
              assert.strictEqual(signal, 'SIGKILL');
            },
          }),
          output,
          exit: () => {},
          processOn: (event, handler) => {
            handlers[event] = handler;
          },
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(processKilled, true);
    });

    it('cleanup finalizes build when buildId exists', async () => {
      let output = createMockOutput();
      let handlers = {};
      let finalizeCalled = false;

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            // Trigger onBuildCreated to set buildId
            deps.onBuildCreated({ buildId: 'build-cleanup-test' });
            // Then trigger SIGINT
            await handlers.SIGINT();
            return { buildId: 'build-cleanup-test', screenshotsCaptured: 0 };
          },
          finalizeBuild: async () => {
            finalizeCalled = true;
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: (event, handler) => {
            handlers[event] = handler;
          },
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(finalizeCalled, true);
    });

    it('cleanup handles finalizeBuild error silently', async () => {
      let output = createMockOutput();
      let handlers = {};

      // Should not throw even when finalizeBuild fails
      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            deps.onBuildCreated({ buildId: 'build-error-test' });
            await handlers.SIGINT();
            return { buildId: 'build-error-test', screenshotsCaptured: 0 };
          },
          finalizeBuild: async () => {
            throw new Error('Finalize failed');
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: (event, handler) => {
            handlers[event] = handler;
          },
          processRemoveListener: () => {},
        }
      );

      // Test passes if no error was thrown
      assert.ok(true);
    });

    it('cleanup handles serverManager.stop error silently', async () => {
      let output = createMockOutput();
      let handlers = {};

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {
              throw new Error('Stop failed');
            },
          }),
          createUploader: () => ({}),
          runTests: async () => {
            await handlers.SIGINT();
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: (event, handler) => {
            handlers[event] = handler;
          },
          processRemoveListener: () => {},
        }
      );

      // Test passes if no error was thrown
      assert.ok(true);
    });

    it('buildManager.createBuild delegates to createBuildObject', async () => {
      let output = createMockOutput();
      let createBuildCalled = false;
      let capturedOptions = null;

      await runCommand(
        'pnpm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createBuildObject: opts => {
            createBuildCalled = true;
            capturedOptions = opts;
            return { id: 'build-123', ...opts };
          },
          createUploader: () => ({}),
          runTests: async ({ deps }) => {
            // Call buildManager.createBuild to exercise line 212
            let build = await deps.buildManager.createBuild({
              name: 'test-build',
            });
            assert.strictEqual(build.name, 'test-build');
            return { buildId: null, screenshotsCaptured: 0 };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          detectCommitMessage: async () => 'test',
          detectPullRequestNumber: () => null,
          generateBuildNameWithGit: async () => 'build',
          output,
          exit: () => {},
          processOn: () => {},
          processRemoveListener: () => {},
        }
      );

      assert.strictEqual(createBuildCalled, true);
      assert.strictEqual(capturedOptions.name, 'test-build');
    });
  });

  describe('validateRunOptions', () => {
    describe('test command validation', () => {
      it('should pass with valid test command', () => {
        let errors = validateRunOptions('pnpm test', {});
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with empty test command', () => {
        let errors = validateRunOptions('', {});
        assert.ok(errors.includes('Test command is required'));
      });

      it('should fail with null test command', () => {
        let errors = validateRunOptions(null, {});
        assert.ok(errors.includes('Test command is required'));
      });

      it('should fail with whitespace-only test command', () => {
        let errors = validateRunOptions('   ', {});
        assert.ok(errors.includes('Test command is required'));
      });
    });

    describe('port validation', () => {
      it('should pass with valid port', () => {
        let errors = validateRunOptions('pnpm test', { port: '3000' });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid port number', () => {
        let errors = validateRunOptions('pnpm test', { port: 'invalid' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });

      it('should fail with decimal port number', () => {
        let errors = validateRunOptions('pnpm test', { port: '3000.5' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });

      it('should fail with port out of range (too low)', () => {
        let errors = validateRunOptions('pnpm test', { port: '0' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });

      it('should fail with port out of range (too high)', () => {
        let errors = validateRunOptions('pnpm test', { port: '65536' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });
    });

    describe('timeout validation', () => {
      it('should pass with valid timeout', () => {
        let errors = validateRunOptions('pnpm test', { timeout: '5000' });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid timeout', () => {
        let errors = validateRunOptions('pnpm test', { timeout: 'invalid' });
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
      });

      it('should fail with decimal timeout', () => {
        let errors = validateRunOptions('pnpm test', { timeout: '5000.5' });
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
      });

      it('should fail with timeout too low', () => {
        let errors = validateRunOptions('pnpm test', { timeout: '500' });
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
      });
    });

    describe('batch size validation', () => {
      it('should pass with valid batch size', () => {
        let errors = validateRunOptions('pnpm test', { batchSize: '10' });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid batch size', () => {
        let errors = validateRunOptions('pnpm test', { batchSize: 'invalid' });
        assert.ok(errors.includes('Batch size must be a positive integer'));
      });

      it('should fail with decimal batch size', () => {
        let errors = validateRunOptions('pnpm test', { batchSize: '2.5' });
        assert.ok(errors.includes('Batch size must be a positive integer'));
      });

      it('should fail with zero batch size', () => {
        let errors = validateRunOptions('pnpm test', { batchSize: '0' });
        assert.ok(errors.includes('Batch size must be a positive integer'));
      });

      it('should fail with negative batch size', () => {
        let errors = validateRunOptions('pnpm test', { batchSize: '-5' });
        assert.ok(errors.includes('Batch size must be a positive integer'));
      });
    });

    describe('upload timeout validation', () => {
      it('should pass with valid upload timeout', () => {
        let errors = validateRunOptions('pnpm test', {
          uploadTimeout: '30000',
        });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid upload timeout', () => {
        let errors = validateRunOptions('pnpm test', {
          uploadTimeout: 'invalid',
        });
        assert.ok(
          errors.includes(
            'Upload timeout must be a positive integer (milliseconds)'
          )
        );
      });

      it('should fail with decimal upload timeout', () => {
        let errors = validateRunOptions('pnpm test', {
          uploadTimeout: '2500.5',
        });
        assert.ok(
          errors.includes(
            'Upload timeout must be a positive integer (milliseconds)'
          )
        );
      });

      it('should fail with zero upload timeout', () => {
        let errors = validateRunOptions('pnpm test', { uploadTimeout: '0' });
        assert.ok(
          errors.includes(
            'Upload timeout must be a positive integer (milliseconds)'
          )
        );
      });
    });

    describe('comparison validation', () => {
      it('should pass with exact-match threshold and min cluster size', () => {
        let errors = validateRunOptions('pnpm test', {
          threshold: '0',
          minClusterSize: '1',
        });

        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid threshold', () => {
        let errors = validateRunOptions('pnpm test', {
          threshold: 'invalid',
        });

        assert.ok(
          errors.includes(
            'Threshold must be a non-negative number (CIEDE2000 Delta E)'
          )
        );
      });

      it('should fail when threshold has trailing text', () => {
        let errors = validateRunOptions('pnpm test', {
          threshold: '2abc',
        });

        assert.ok(
          errors.includes(
            'Threshold must be a non-negative number (CIEDE2000 Delta E)'
          )
        );
      });

      it('should fail with non-integer min cluster size', () => {
        let errors = validateRunOptions('pnpm test', {
          minClusterSize: '2.5',
        });

        assert.ok(
          errors.includes('Min cluster size must be a positive integer')
        );
      });

      it('should fail with zero min cluster size', () => {
        let errors = validateRunOptions('pnpm test', {
          minClusterSize: '0',
        });

        assert.ok(
          errors.includes('Min cluster size must be a positive integer')
        );
      });
    });

    describe('multiple validation errors', () => {
      it('should return all validation errors', () => {
        let errors = validateRunOptions('', {
          port: 'invalid',
          timeout: '500',
          batchSize: '-1',
        });

        assert.strictEqual(errors.length, 4);
        assert.ok(errors.includes('Test command is required'));
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
        assert.ok(errors.includes('Batch size must be a positive integer'));
      });
    });
  });
});
