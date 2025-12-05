import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '../../src/cli.js');

/**
 * Helper function to run CLI command with completely isolated environment
 */
function runCLI(args, options = {}) {
  return new Promise((resolve, reject) => {
    // Start with minimal clean environment - only essential system vars
    const cleanEnv = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      CI: 'true',
      // Explicitly disable dotenv loading to prevent .env file reading
      DOTENV_CONFIG_PATH: '/dev/null',
      VIZZLY_API_URL: 'https://api.vizzly.dev/test',
      VIZZLY_SERVER_URL: 'https://api.vizzly.dev/test',
    };

    // Explicitly remove any Vizzly tokens (setting to undefined doesn't work)
    delete cleanEnv.VIZZLY_TOKEN;
    delete cleanEnv.VIZZLY_API_KEY;

    // Only add explicitly provided test env vars
    if (options.env) {
      Object.assign(cleanEnv, options.env);
    }

    // Create a completely isolated temp directory that definitely has no .env files
    // Use a more unique identifier to prevent any collision
    const testCwd =
      options.cwd ||
      `/tmp/vizzly-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Ensure the temp directory exists
    try {
      mkdirSync(testCwd, { recursive: true });
    } catch {
      // Ignore if directory already exists
    }

    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
      cwd: testCwd,
    });

    let stdout = '';
    let stderr = '';
    let isResolved = false;

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      }
    });

    child.on('error', error => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    // Kill process after timeout to prevent hanging
    // Use longer timeout for CI environments to reduce flakiness
    const timeout = options.timeout || (process.env.CI ? 15000 : 10000);
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        child.kill('SIGTERM');
        reject(new Error(`Process timeout after ${timeout}ms`));
      }
    }, timeout);
  });
}

describe('TDD Command Integration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment but without any Vizzly tokens
    originalEnv = { ...process.env };
    delete originalEnv.VIZZLY_TOKEN;
    delete originalEnv.VIZZLY_API_KEY;

    // Clear all Vizzly environment variables from current process
    delete process.env.VIZZLY_TOKEN;
    delete process.env.VIZZLY_API_KEY;
    delete process.env.VIZZLY_API_URL;
    delete process.env.VIZZLY_VERBOSE;
    delete process.env.VIZZLY_JSON_OUTPUT;

    // Clear any global mocks that might interfere with child processes
    if (global.fetch && typeof global.fetch.mockRestore === 'function') {
      global.fetch.mockRestore();
    }
    delete global.fetch;
  });

  afterEach(() => {
    // Restore clean environment (without tokens)
    process.env = { ...originalEnv };
    // Double-ensure Vizzly tokens are never restored
    delete process.env.VIZZLY_TOKEN;
    delete process.env.VIZZLY_API_KEY;
  });

  describe('TDD Command Basic Functionality', () => {
    it('should show help for tdd command', async () => {
      const result = await runCLI(['tdd', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Run tests in TDD mode');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('run');
    });

    it('should require command argument for tdd run', async () => {
      const result = await runCLI(['tdd', 'run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: missing required argument 'command'"
      );
    });

    it('should show help with all TDD run options', async () => {
      const result = await runCLI(['tdd', 'run', '--help']);

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

    it('should validate port option correctly', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--port',
        'invalid',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Port must be a valid number');
    });

    it('should validate threshold option correctly', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--threshold',
        '-0.5', // negative threshold is invalid
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    });

    it('should validate timeout option correctly', async () => {
      const result = await runCLI([
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

    it('should start TDD with command', async () => {
      const result = await runCLI(['tdd', 'run', 'echo test']);

      // The TDD command should start - may fail in execution but shouldn't have CLI errors
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('missing required argument');
      // Should show it completed (new output format shows result)
      expect(result.stderr).toContain('vizzly · tdd');
    });
  });

  describe('TDD Command Options and Configuration', () => {
    it('should accept valid port option', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--port',
        '47503',
      ]);

      // Should not have validation errors for port
      expect(result.stderr).not.toContain('invalid port');
      expect(result.stderr).not.toContain('Port must be');
    });

    it('should accept valid threshold option', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--threshold',
        '0.05',
      ]);

      // Should not have validation errors for threshold
      expect(result.stderr).not.toContain('Threshold must be');
    });

    it('should accept valid timeout option', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--timeout',
        '5000',
      ]);

      // Should not have validation errors for timeout
      expect(result.stderr).not.toContain('Timeout must be');
    });

    it('should handle environment option', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--environment',
        'staging',
      ]);

      // Should not have CLI errors - may fail in execution but CLI parsing should work
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });

    it('should handle baseline comparison option', async () => {
      const result = await runCLI([
        'tdd',
        'run',
        'echo test',
        '--baseline-comparison',
        'comp-456',
      ]);

      // Should not have CLI errors
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });
  });

  describe('Global Options Integration', () => {
    it('should respect global --verbose option', async () => {
      const result = await runCLI(['--verbose', 'tdd', 'run', 'echo test']);

      // Should not have CLI parsing errors
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });

    it('should respect global --json option', async () => {
      const result = await runCLI(['--json', 'tdd', 'run', 'echo test']);

      // Should not have CLI parsing errors
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });

    it('should respect global --no-color option', async () => {
      const result = await runCLI(['--no-color', 'tdd', 'run', 'echo test']);

      // Should not have CLI parsing errors
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stderr).not.toContain('invalid option');
    });
  });
});
