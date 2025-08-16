import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

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

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.on('error', reject);

    // Kill process after timeout to prevent hanging
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Process timeout'));
    }, 5000);
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
  });

  afterEach(() => {
    // Restore clean environment (without tokens)
    process.env = { ...originalEnv };
    // Double-ensure Vizzly tokens are never restored
    delete process.env.VIZZLY_TOKEN;
    delete process.env.VIZZLY_API_KEY;
  });

  describe('TDD Command Basic Functionality', () => {
    it('should require test command argument', async () => {
      const result = await runCLI(['tdd']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should auto-detect missing API token and run in local-only mode', async () => {
      const result = await runCLI(['tdd', 'echo "test"']);

      // Should succeed and show warning about no token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should show help with all TDD-specific options', async () => {
      const result = await runCLI(['tdd', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Run tests in TDD mode with local visual comparisons'
      );
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('--branch <branch>');
      expect(result.stdout).toContain('--environment <env>');
      expect(result.stdout).toContain('--threshold <number>');
      expect(result.stdout).toContain('--token <token>');
      expect(result.stdout).toContain('--timeout <ms>');
      expect(result.stdout).toContain('--baseline-build <id>');
      expect(result.stdout).toContain('--baseline-comparison <id>');
      expect(result.stdout).toContain('--allow-no-token');
    });

    it('should validate port option correctly', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--port', 'invalid']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Port must be a valid number');
    });

    it('should validate threshold option correctly', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--threshold', '1.5']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Threshold must be a number between 0 and 1'
      );
    });

    it('should validate timeout option correctly', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--timeout', '500']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Timeout must be at least 1000 milliseconds'
      );
    });

    it('should handle --allow-no-token flag', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--allow-no-token']);

      // Should not fail due to missing token when --allow-no-token is used
      // Note: It may still fail for other reasons (like missing baseline) but
      // it shouldn't fail with the "API token required" error
      expect(result.stderr).not.toContain('API token required for TDD mode');
    });

    it('should run successfully without token (auto-detected)', async () => {
      const result = await runCLI(['tdd', 'echo "test"']);

      // Now succeeds automatically with missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
      expect(result.stderr).not.toContain('--allow-no-token');
    });
  });

  describe('TDD Command Options and Configuration', () => {
    it('should accept valid port option', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--port', '47503']);

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('invalid port');
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should accept valid threshold option', async () => {
      const result = await runCLI([
        'tdd',
        'echo "test"',
        '--threshold',
        '0.05',
      ]);

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('Threshold must be');
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should accept valid timeout option', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--timeout', '5000']);

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('Timeout must be');
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle environment option', async () => {
      const result = await runCLI([
        'tdd',
        'echo "test"',
        '--environment',
        'staging',
      ]);

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle baseline comparison option', async () => {
      const result = await runCLI([
        'tdd',
        'echo "test"',
        '--baseline-comparison',
        'comp-456',
      ]);

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });
  });

  describe('Global Options Integration', () => {
    it('should respect global --verbose option', async () => {
      const result = await runCLI(['--verbose', 'tdd', 'echo "test"']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should respect global --json option', async () => {
      const result = await runCLI(['--json', 'tdd', 'echo "test"']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should respect global --no-color option', async () => {
      const result = await runCLI(['--no-color', 'tdd', 'echo "test"']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });
  });
});
