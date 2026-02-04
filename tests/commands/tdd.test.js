import assert from 'node:assert';
import { describe, it } from 'node:test';
import { tddCommand, validateTddOptions } from '../../src/commands/tdd.js';

/**
 * Create mock output object that tracks calls
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    info: msg => calls.push({ method: 'info', args: [msg] }),
    debug: (a, b, c) => calls.push({ method: 'debug', args: [a, b, c] }),
    error: (msg, err) => calls.push({ method: 'error', args: [msg, err] }),
    warn: msg => calls.push({ method: 'warn', args: [msg] }),
    success: msg => calls.push({ method: 'success', args: [msg] }),
    result: msg => calls.push({ method: 'result', args: [msg] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

/**
 * Create minimal mock config
 */
function createMockConfig(overrides = {}) {
  return {
    apiKey: null,
    apiUrl: 'https://api.test',
    server: { port: 47392, timeout: 30000 },
    build: { environment: 'test' },
    comparison: { threshold: 0.1 },
    ...overrides,
  };
}

describe('commands/tdd', () => {
  describe('tddCommand', () => {
    it('works without API token in TDD mode', async () => {
      let output = createMockOutput();
      let runTestsCalled = false;

      let { result, cleanup } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => {
            runTestsCalled = true;
            return { screenshotsCaptured: 5, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc123',
          output,
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(runTestsCalled, true);
      await cleanup();
    });

    it('requires token when baselineBuild flag is set', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        { baselineBuild: 'build-123' },
        {},
        {
          loadConfig: async () => createMockConfig({ apiKey: null }),
          output,
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('API token required'));
    });

    it('requires token when baselineComparison flag is set', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        { baselineComparison: 'comp-123' },
        {},
        {
          loadConfig: async () => createMockConfig({ apiKey: null }),
          output,
        }
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('API token required'));
    });

    it('configures output with global options', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        {},
        { json: true, verbose: true, noColor: true },
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => ({ screenshotsCaptured: 0, comparisons: [] }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      let configureCall = output.calls.find(c => c.method === 'configure');
      assert.ok(configureCall);
      assert.strictEqual(configureCall.args[0].json, true);
      assert.strictEqual(configureCall.args[0].verbose, true);
      assert.strictEqual(configureCall.args[0].color, false);
    });

    it('shows header in non-daemon mode', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => ({ screenshotsCaptured: 0, comparisons: [] }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.ok(output.calls.some(c => c.method === 'header'));
    });

    it('skips header in daemon mode', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        { daemon: true },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          initializeDaemon: async () => {},
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.ok(!output.calls.some(c => c.method === 'header'));
    });

    it('returns daemon result in daemon mode', async () => {
      let output = createMockOutput();

      let { result, cleanup } = await tddCommand(
        'npm test',
        { daemon: true },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          initializeDaemon: async () => {},
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.daemon, true);
      assert.strictEqual(result.port, 47392);
      await cleanup();
    });

    it('handles successful test run with passed comparisons', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => ({
            screenshotsCaptured: 3,
            comparisons: [
              { status: 'passed' },
              { status: 'passed' },
              { status: 'passed' },
            ],
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.exitCode, 0);
      // Summary output is handled by printResults() in tdd-service.js
    });

    it('handles test run with failed comparisons', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => ({
            screenshotsCaptured: 3,
            comparisons: [
              { status: 'passed' },
              { status: 'failed' },
              { status: 'failed' },
            ],
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
      // Summary output is handled by printResults() in tdd-service.js
    });

    it('handles config loading error', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => {
            throw new Error('Config not found');
          },
          output,
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
      assert.ok(result.error.includes('Config not found'));
    });

    it('handles runTests error', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => {
            throw new Error('Test execution failed');
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    it('cleanup function stops server', async () => {
      let output = createMockOutput();
      let serverStopped = false;

      let { cleanup } = await tddCommand(
        'npm test',
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
          runTests: async () => ({ screenshotsCaptured: 0, comparisons: [] }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      await cleanup();
      assert.strictEqual(serverStopped, true);
    });

    it('cleanup is idempotent', async () => {
      let output = createMockOutput();
      let stopCount = 0;

      let { cleanup } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {
              stopCount++;
            },
          }),
          runTests: async () => ({ screenshotsCaptured: 0, comparisons: [] }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      await cleanup();
      await cleanup();
      await cleanup();

      assert.strictEqual(stopCount, 1);
    });

    it('uses provided git metadata options', async () => {
      let output = createMockOutput();
      let capturedRunOptions = null;

      await tddCommand(
        'npm test',
        { branch: 'feature', commit: 'def456' },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async ({ runOptions }) => {
            capturedRunOptions = runOptions;
            return { screenshotsCaptured: 0, comparisons: [] };
          },
          detectBranch: async branch => branch || 'default',
          detectCommit: async commit => commit || 'default',
          output,
        }
      );

      assert.strictEqual(capturedRunOptions.branch, 'feature');
      assert.strictEqual(capturedRunOptions.commit, 'def456');
    });

    it('invokes onBuildCreated callback', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async ({ deps }) => {
            deps.onBuildCreated({ buildId: 'build-1234567890' });
            return { screenshotsCaptured: 1, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      // debug('build', 'created build-12') - args[0]='build', args[1]='created build-12'
      assert.ok(
        output.calls.some(
          c =>
            c.method === 'debug' &&
            c.args[0] === 'build' &&
            c.args[1]?.includes('build-12')
        )
      );
    });

    it('invokes onServerReady callback', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async ({ deps }) => {
            deps.onServerReady({ port: 47392 });
            return { screenshotsCaptured: 0, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      // debug('server', 'listening on :47392')
      assert.ok(
        output.calls.some(
          c =>
            c.method === 'debug' &&
            c.args[0] === 'server' &&
            c.args[1]?.includes('47392')
        )
      );
    });

    it('invokes onFinalizeFailed callback', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async ({ deps }) => {
            deps.onFinalizeFailed({ error: 'Network error' });
            return { screenshotsCaptured: 0, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.ok(
        output.calls.some(
          c => c.method === 'warn' && c.args[0].includes('finalize')
        )
      );
    });

    it('invokes onServerReady in daemon mode', async () => {
      let output = createMockOutput();

      await tddCommand(
        'npm test',
        { daemon: true },
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          initializeDaemon: async ({ deps }) => {
            deps.onServerReady({ port: 47392 });
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      // debug('server', 'listening on :47392')
      assert.ok(
        output.calls.some(
          c =>
            c.method === 'debug' &&
            c.args[0] === 'server' &&
            c.args[1]?.includes('47392')
        )
      );
    });

    // Output pluralization tests removed - summary output is handled by printResults() in tdd-service.js

    it('handles runResult.failed flag', async () => {
      let output = createMockOutput();

      let { result } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async () => ({
            screenshotsCaptured: 2,
            failed: true,
            comparisons: [{ status: 'passed' }, { status: 'passed' }],
          }),
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    it('cleanup kills test process if not already killed', async () => {
      let output = createMockOutput();
      let processKilled = false;

      let { cleanup } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async ({ deps }) => {
            // Simulate spawning a process
            deps.spawn('echo', {});
            return { screenshotsCaptured: 0, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          spawn: () => ({
            killed: false,
            kill: signal => {
              processKilled = true;
              assert.strictEqual(signal, 'SIGKILL');
            },
          }),
          output,
        }
      );

      await cleanup();
      assert.strictEqual(processKilled, true);
    });

    it('cleanup does not kill already killed process', async () => {
      let output = createMockOutput();
      let killCalled = false;

      let { cleanup } = await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          runTests: async ({ deps }) => {
            deps.spawn('echo', {});
            return { screenshotsCaptured: 0, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          spawn: () => ({
            killed: true, // Already killed
            kill: () => {
              killCalled = true;
            },
          }),
          output,
        }
      );

      await cleanup();
      assert.strictEqual(killCalled, false);
    });

    it('calls buildManager.createBuild when runTests uses it', async () => {
      let output = createMockOutput();
      let createBuildCalled = false;

      await tddCommand(
        'npm test',
        {},
        {},
        {
          loadConfig: async () => createMockConfig(),
          createServerManager: () => ({
            start: async () => {},
            stop: async () => {},
          }),
          createBuildObject: buildOptions => {
            createBuildCalled = true;
            return { id: 'test-build', ...buildOptions };
          },
          runTests: async ({ deps }) => {
            // Simulate runTests calling buildManager.createBuild
            await deps.buildManager.createBuild({ name: 'test' });
            return { screenshotsCaptured: 0, comparisons: [] };
          },
          detectBranch: async () => 'main',
          detectCommit: async () => 'abc',
          output,
        }
      );

      assert.strictEqual(createBuildCalled, true);
    });
  });

  describe('validateTddOptions', () => {
    describe('test command validation', () => {
      it('should pass with valid test command', () => {
        let errors = validateTddOptions('npm test', {});
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with empty test command', () => {
        let errors = validateTddOptions('', {});
        assert.ok(errors.includes('Test command is required'));
      });

      it('should fail with null test command', () => {
        let errors = validateTddOptions(null, {});
        assert.ok(errors.includes('Test command is required'));
      });

      it('should fail with whitespace-only test command', () => {
        let errors = validateTddOptions('   ', {});
        assert.ok(errors.includes('Test command is required'));
      });
    });

    describe('port validation', () => {
      it('should pass with valid port', () => {
        let errors = validateTddOptions('npm test', { port: '3000' });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid port number', () => {
        let errors = validateTddOptions('npm test', { port: 'invalid' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });

      it('should fail with port out of range (too low)', () => {
        let errors = validateTddOptions('npm test', { port: '0' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });

      it('should fail with port out of range (too high)', () => {
        let errors = validateTddOptions('npm test', { port: '65536' });
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
      });
    });

    describe('timeout validation', () => {
      it('should pass with valid timeout', () => {
        let errors = validateTddOptions('npm test', { timeout: '5000' });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid timeout', () => {
        let errors = validateTddOptions('npm test', { timeout: 'invalid' });
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
      });

      it('should fail with timeout too low', () => {
        let errors = validateTddOptions('npm test', { timeout: '500' });
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
      });
    });

    describe('threshold validation', () => {
      it('should pass with valid threshold', () => {
        let errors = validateTddOptions('npm test', { threshold: '0.1' });
        assert.strictEqual(errors.length, 0);
      });

      it('should pass with threshold of 0', () => {
        let errors = validateTddOptions('npm test', { threshold: '0' });
        assert.strictEqual(errors.length, 0);
      });

      it('should pass with threshold of 1', () => {
        let errors = validateTddOptions('npm test', { threshold: '1' });
        assert.strictEqual(errors.length, 0);
      });

      it('should fail with invalid threshold', () => {
        let errors = validateTddOptions('npm test', { threshold: 'invalid' });
        assert.ok(
          errors.includes(
            'Threshold must be a non-negative number (CIEDE2000 Delta E)'
          )
        );
      });

      it('should fail with threshold below 0', () => {
        let errors = validateTddOptions('npm test', { threshold: '-0.1' });
        assert.ok(
          errors.includes(
            'Threshold must be a non-negative number (CIEDE2000 Delta E)'
          )
        );
      });

      it('should pass with threshold above 1 (CIEDE2000 allows values > 1)', () => {
        let errors = validateTddOptions('npm test', { threshold: '2.0' });
        assert.strictEqual(errors.length, 0);
      });
    });

    describe('multiple validation errors', () => {
      it('should return all validation errors', () => {
        let errors = validateTddOptions('', {
          port: 'invalid',
          timeout: '500',
          threshold: '-1',
        });

        assert.strictEqual(errors.length, 4);
        assert.ok(errors.includes('Test command is required'));
        assert.ok(
          errors.includes('Port must be a valid number between 1 and 65535')
        );
        assert.ok(
          errors.includes('Timeout must be at least 1000 milliseconds')
        );
        assert.ok(
          errors.includes(
            'Threshold must be a non-negative number (CIEDE2000 Delta E)'
          )
        );
      });
    });
  });
});
