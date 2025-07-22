import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '../../src/cli.js');

/**
 * Helper function to run CLI command and capture output
 */
function runCLI(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd(),
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
  describe('TDD Command Basic Functionality', () => {
    it('should require test command argument', async () => {
      const result = await runCLI(['tdd']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should auto-detect missing API token and run in local-only mode', async () => {
      const result = await runCLI(['tdd', 'echo "test"'], {
        env: { CI: 'true' },
      });

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
      const result = await runCLI(['tdd', 'echo "test"', '--port', 'invalid'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Port must be a valid number');
    });

    it('should validate threshold option correctly', async () => {
      const result = await runCLI(
        ['tdd', 'echo "test"', '--threshold', '1.5'],
        {
          env: { CI: 'true' },
        }
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Threshold must be a number between 0 and 1'
      );
    });

    it('should validate timeout option correctly', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--timeout', '500'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Timeout must be at least 1000 milliseconds'
      );
    });

    it('should handle --allow-no-token flag', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--allow-no-token'], {
        env: { CI: 'true' },
      });

      // Should not fail due to missing token when --allow-no-token is used
      // Note: It may still fail for other reasons (like missing baseline) but
      // it shouldn't fail with the "API token required" error
      expect(result.stderr).not.toContain('API token required for TDD mode');
    });

    it('should run successfully without token (auto-detected)', async () => {
      const result = await runCLI(['tdd', 'echo "test"'], {
        env: { CI: 'true' },
      });

      // Now succeeds automatically with missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
      expect(result.stderr).not.toContain('--allow-no-token');
    });
  });

  describe('Run command with TDD flag', () => {
    it('should handle run --tdd command as shortcut', async () => {
      const result = await runCLI(['run', '--tdd', 'echo "test"'], {
        env: { CI: 'true' },
      });

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle run --tdd with options as shortcut', async () => {
      const result = await runCLI(
        [
          'run',
          '--tdd',
          'echo "test"',
          '--port',
          '8080',
          '--environment',
          'staging',
          '--threshold',
          '0.05',
        ],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle validation errors in run --tdd shortcut', async () => {
      const result = await runCLI(
        ['run', '--tdd', 'echo "test"', '--port', 'invalid'],
        {
          env: { CI: 'true' },
        }
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Port must be a valid number');
    });
  });

  describe('TDD Command Options and Configuration', () => {
    it('should accept valid port option', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--port', '8080'], {
        env: { CI: 'true' },
      });

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('invalid port');
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should accept valid threshold option', async () => {
      const result = await runCLI(
        ['tdd', 'echo "test"', '--threshold', '0.05'],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('Threshold must be');
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should accept valid timeout option', async () => {
      const result = await runCLI(['tdd', 'echo "test"', '--timeout', '5000'], {
        env: { CI: 'true' },
      });

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('Timeout must be');
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle environment option', async () => {
      const result = await runCLI(
        ['tdd', 'echo "test"', '--environment', 'staging'],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle branch option', async () => {
      const result = await runCLI(
        ['tdd', 'echo "test"', '--branch', 'feature'],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle baseline build option', async () => {
      const result = await runCLI(
        ['tdd', 'echo "test"', '--baseline-build', 'build-123'],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should handle baseline comparison option', async () => {
      const result = await runCLI(
        ['tdd', 'echo "test"', '--baseline-comparison', 'comp-456'],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed with auto-detected missing token
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });
  });

  describe('Global Options Integration', () => {
    it('should respect global --verbose option', async () => {
      const result = await runCLI(['--verbose', 'tdd', 'echo "test"'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should respect global --json option', async () => {
      const result = await runCLI(['--json', 'tdd', 'echo "test"'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });

    it('should respect global --no-color option', async () => {
      const result = await runCLI(['--no-color', 'tdd', 'echo "test"'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'No API token detected - running in local-only mode'
      );
    });
  });
});
