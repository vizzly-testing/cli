/**
 * CLI Integration Tests
 *
 * Consolidated CLI tests that spawn real Node processes.
 * Uses shared temp directory to reduce filesystem churn.
 *
 * Tests cover:
 * - Global options (--help, --version, --verbose, --json, --no-color)
 * - All commands (upload, run, tdd, init, status, doctor)
 * - Option validation and parsing
 * - Error handling and JSON output
 * - Environment variable integration
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  createCLIRunner,
  findJSONMessage,
  parseJSONOutput,
} from '../helpers/cli-runner.js';

describe('CLI Integration', () => {
  let tempDir;
  let cli;
  let originalEnv;

  beforeAll(() => {
    // Create ONE temp directory for all tests in this suite
    tempDir = mkdtempSync(join(tmpdir(), 'vizzly-cli-test-'));
    cli = createCLIRunner(tempDir);
  });

  afterAll(() => {
    // Clean up temp directory after all tests
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Isolate environment per test
    originalEnv = { ...process.env };
    delete process.env.VIZZLY_TOKEN;
    delete process.env.VIZZLY_API_KEY;
    delete process.env.VIZZLY_API_URL;
    delete process.env.VIZZLY_VERBOSE;
    delete process.env.VIZZLY_JSON_OUTPUT;

    // Clear any global mocks
    if (global.fetch && typeof global.fetch.mockRestore === 'function') {
      global.fetch.mockRestore();
    }
    delete global.fetch;
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
    delete process.env.VIZZLY_TOKEN;
    delete process.env.VIZZLY_API_KEY;
  });

  // ============================================================================
  // Global Options
  // ============================================================================

  describe('Global options', () => {
    it('shows help with all global options', async () => {
      let result = await cli.run(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--config <path>');
      expect(result.stdout).toContain('--token <token>');
      expect(result.stdout).toContain('--verbose');
      expect(result.stdout).toContain('--json');
      expect(result.stdout).toContain('--no-color');
    });

    it('shows version', async () => {
      let result = await cli.run(['--version']);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('rejects unknown global option', async () => {
      let result = await cli.run(['--unknown-option']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('unknown option');
    });
  });

  // ============================================================================
  // Upload Command
  // ============================================================================

  describe('upload command', () => {
    it('shows help with all options', async () => {
      let result = await cli.run(['upload', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--build-name <name>');
      expect(result.stdout).toContain('--metadata <json>');
      expect(result.stdout).toContain('--branch <branch>');
      expect(result.stdout).toContain('--commit <sha>');
      expect(result.stdout).toContain('--message <msg>');
      expect(result.stdout).toContain('--environment <env>');
      expect(result.stdout).toContain('--threshold <number>');
      expect(result.stdout).toContain('--token <token>');
      expect(result.stdout).toContain('--wait');
    });

    it('requires path argument', async () => {
      let result = await cli.run(['upload']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('outputs JSON error format with --json flag', async () => {
      let result = await cli.run(['upload', './test-screenshots', '--json'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(1);
      let errorMsg = findJSONMessage(result.stderr, 'error');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.message).toContain('API token required');
    });

    it('requires API token', async () => {
      let result = await cli.run(['upload', './screenshots'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('API token required');
      expect(result.stderr).not.toContain('⠋'); // No spinner artifacts
    });
  });

  // ============================================================================
  // Run Command
  // ============================================================================

  describe('run command', () => {
    it('shows help with all options', async () => {
      let result = await cli.run(['run', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('--build-name <name>');
      expect(result.stdout).toContain('--branch <branch>');
      expect(result.stdout).toContain('--environment <env>');
      expect(result.stdout).toContain('--wait');
      expect(result.stdout).toContain('--timeout <ms>');
      expect(result.stdout).toContain('--allow-no-token');
    });

    it('requires command argument', async () => {
      let result = await cli.run(['run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
      expect(result.stderr).toContain('command');
    });

    it('succeeds with --allow-no-token', async () => {
      let result = await cli.run(
        ['run', 'echo "hello world"', '--allow-no-token'],
        { env: { CI: 'true' } }
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toContain('Test run completed successfully');
    });

    it('accepts valid port option', async () => {
      let result = await cli.run(
        ['run', 'echo "test"', '--port', '47501', '--allow-no-token'],
        { env: { CI: 'true' } }
      );

      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('invalid port');
    });

    it('reports failure when test command fails', async () => {
      let result = await cli.run(['run', 'exit 1', '--allow-no-token'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Test run failed');
    });
  });

  // ============================================================================
  // TDD Command
  // ============================================================================

  describe('tdd command', () => {
    it('shows help for main tdd command', async () => {
      let result = await cli.run(['tdd', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Run tests in TDD mode');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('run');
    });

    it('shows help for tdd run with all options', async () => {
      let result = await cli.run(['tdd', 'run', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Run tests once in TDD mode with local visual comparisons'
      );
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('--branch <branch>');
      expect(result.stdout).toContain('--environment <env>');
      expect(result.stdout).toContain('--threshold <number>');
      expect(result.stdout).toContain('--token <token>');
      expect(result.stdout).toContain('--timeout <ms>');
      expect(result.stdout).toContain('--baseline-build <id>');
      expect(result.stdout).toContain('--baseline-comparison <id>');
      expect(result.stdout).toContain('--set-baseline');
    });

    it('requires command argument for tdd run', async () => {
      let result = await cli.run(['tdd', 'run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("missing required argument 'command'");
    });

    it('starts TDD mode with valid command', async () => {
      let result = await cli.run(['tdd', 'run', 'echo test']);

      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).toContain('vizzly · tdd');
    });

    it('accepts valid port option', async () => {
      let result = await cli.run(
        ['tdd', 'run', 'echo test', '--port', '47503'],
        { env: { CI: 'true' } }
      );

      expect(result.stderr).not.toContain('Port must be');
    });

    it('accepts valid threshold option', async () => {
      let result = await cli.run(
        ['tdd', 'run', 'echo test', '--threshold', '0.05'],
        { env: { CI: 'true' } }
      );

      expect(result.stderr).not.toContain('Threshold must be');
    });

    it('accepts valid timeout option', async () => {
      let result = await cli.run(
        ['tdd', 'run', 'echo test', '--timeout', '5000'],
        { env: { CI: 'true' } }
      );

      expect(result.stderr).not.toContain('Timeout must be');
    });

    it('accepts environment option', async () => {
      let result = await cli.run(
        ['tdd', 'run', 'echo test', '--environment', 'staging'],
        { env: { CI: 'true' } }
      );

      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });

    it('accepts baseline-comparison option', async () => {
      let result = await cli.run(
        ['tdd', 'run', 'echo test', '--baseline-comparison', 'comp-456'],
        { env: { CI: 'true' } }
      );

      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });
  });

  // ============================================================================
  // TDD Option Validation
  // ============================================================================

  describe('tdd option validation', () => {
    it('rejects invalid port', async () => {
      let result = await cli.run([
        'tdd',
        'run',
        'echo test',
        '--port',
        'invalid',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Port must be a valid number');
    });

    it('rejects negative threshold', async () => {
      let result = await cli.run([
        'tdd',
        'run',
        'echo test',
        '--threshold',
        '-0.5',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Threshold must be a non-negative number'
      );
    });

    it('rejects timeout below minimum', async () => {
      let result = await cli.run([
        'tdd',
        'run',
        'echo test',
        '--timeout',
        '500',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Timeout must be at least 1000 milliseconds'
      );
    });
  });

  // ============================================================================
  // TDD Global Options Integration
  // ============================================================================

  describe('tdd with global options', () => {
    it('respects --verbose option', async () => {
      let result = await cli.run(['--verbose', 'tdd', 'run', 'echo test']);

      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });

    it('respects --json option', async () => {
      let result = await cli.run(['--json', 'tdd', 'run', 'echo test']);

      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });

    it('respects --no-color option', async () => {
      let result = await cli.run(['--no-color', 'tdd', 'run', 'echo test']);

      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });
  });

  // ============================================================================
  // Init Command
  // ============================================================================

  describe('init command', () => {
    it('shows help with force option', async () => {
      let result = await cli.run(['init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--force');
      expect(result.stdout).toContain('Overwrite existing configuration');
    });
  });

  // ============================================================================
  // Status Command
  // ============================================================================

  describe('status command', () => {
    it('shows help', async () => {
      let result = await cli.run(['status', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Check the status of a build');
      expect(result.stdout).toContain('<build-id>');
    });

    it('requires build ID argument', async () => {
      let result = await cli.run(['status']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('validates empty build ID', async () => {
      let result = await cli.run(['status', '']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Build ID is required');
    });

    it('requires API token', async () => {
      let result = await cli.run(['status', 'build-123']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('API token required');
    });

    it('supports JSON output mode', async () => {
      let result = await cli.run(['status', 'build-123', '--json']);

      expect(result.code).toBe(1);
      let errorMsg = findJSONMessage(result.stderr, 'error');
      expect(errorMsg).toBeTruthy();
    });
  });

  // ============================================================================
  // Doctor Command
  // ============================================================================

  describe('doctor command', () => {
    it('shows help with --api flag', async () => {
      let result = await cli.run(['doctor', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Run diagnostics to check your environment and configuration'
      );
      expect(result.stdout).toContain('--api');
    });

    it('runs preflight checks locally without token', async () => {
      let result = await cli.run(['doctor']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Running Vizzly preflight (local checks only)...'
      );
      expect(result.stderr).toContain('Preflight passed.');
    });

    it('requires token for --api flag', async () => {
      let result = await cli.run(['doctor', '--api']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Missing API token for connectivity check'
      );
    });

    it('attempts API connectivity with token', async () => {
      let result = await cli.run(['doctor', '--api'], {
        env: { VIZZLY_TOKEN: 'dummy-token' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('API connectivity failed');
    });

    it('supports JSON output mode', async () => {
      let result = await cli.run(['doctor', '--json']);

      expect(result.code).toBe(0);
      let dataMsg = findJSONMessage(result.stdout, 'data');
      expect(dataMsg).toBeTruthy();
      expect(dataMsg.data.passed).toBe(true);
    });
  });

  // ============================================================================
  // JSON Output
  // ============================================================================

  describe('JSON output mode', () => {
    it('outputs valid JSON with --json flag', async () => {
      let result = await cli.run(['upload', './screenshots', '--json']);

      expect(result.code).toBe(1);
      let messages = parseJSONOutput(result.stderr);
      expect(messages.length).toBeGreaterThan(0);
    });

    it('includes timestamps in JSON output', async () => {
      let result = await cli.run(['upload', './screenshots', '--json']);

      let messages = parseJSONOutput(result.stderr);
      let msgWithTimestamp = messages.find(m => m.timestamp);
      if (msgWithTimestamp) {
        expect(msgWithTimestamp.timestamp).toMatch(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
        );
      }
    });
  });

  // ============================================================================
  // Environment Variable Integration
  // ============================================================================

  describe('environment variables', () => {
    it('uses VIZZLY_TOKEN from environment', async () => {
      let result = await cli.run(['upload', './screenshots'], {
        env: { VIZZLY_TOKEN: 'test-token-from-env' },
      });

      // Should get past token check (will fail for other reasons)
      expect(result.stderr).not.toContain('API token required');
    });

    it('prioritizes --token flag over environment', async () => {
      let result = await cli.run(
        ['upload', './screenshots', '--token', 'cli-token'],
        { env: { VIZZLY_TOKEN: 'env-token' } }
      );

      // CLI token should work (will fail for other reasons, not token)
      expect(result.stderr).not.toContain('API token required');
    });
  });
});
