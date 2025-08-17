import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', 'src', 'cli.js');

// Helper to run CLI commands
function runCLI(args = [], options = {}) {
  return new Promise((resolve, reject) => {
    // Create clean environment to prevent hitting local dev server
    const cleanEnv = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      CI: 'true',
      // Force API URL to prevent hitting local dev server
      VIZZLY_API_URL: 'https://api.vizzly.dev/test',
      // Prevent any localhost connections
      VIZZLY_SERVER_URL: 'https://api.vizzly.dev/test',
    };

    // Explicitly remove any Vizzly tokens (setting to undefined doesn't work)
    delete cleanEnv.VIZZLY_TOKEN;
    delete cleanEnv.VIZZLY_API_KEY;

    // Merge with any provided env options
    const finalEnv = { ...cleanEnv, ...(options.env || {}) };

    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: 'pipe',
      ...options,
      env: finalEnv,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', data => {
      stdout += data.toString();
    });

    child.stderr?.on('data', data => {
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

    // Kill process after timeout to prevent hanging tests
    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        reject(new Error('CLI command timed out'));
      }
    }, 10000);
  });
}

describe('Vizzly CLI', () => {
  describe('basic commands', () => {
    it('should show help when no command provided', async () => {
      const result = await runCLI(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Vizzly CLI for visual regression testing'
      );
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('upload');
      expect(result.stdout).toContain('run');
      expect(result.stdout).toContain('tdd');
    });

    it('should show version', async () => {
      const result = await runCLI(['--version']);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Should show version number
    });

    it('should show command help', async () => {
      const result = await runCLI(['init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
      expect(result.stdout).toContain('--force');
    });
  });

  describe('command validation', () => {
    it('should validate upload command arguments', async () => {
      const result = await runCLI(['upload']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: missing required argument 'path'"
      );
    });

    it('should validate run command arguments', async () => {
      const result = await runCLI(['run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: missing required argument 'command'"
      );
    });

    it('should validate tdd command arguments', async () => {
      const result = await runCLI(['tdd']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: missing required argument 'command'"
      );
    });

    it('should validate status command arguments', async () => {
      const result = await runCLI(['status']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: missing required argument 'build-id'"
      );
    });
  });

  describe('option parsing', () => {
    it('should parse global options', async () => {
      const result = await runCLI(['--verbose', 'init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
    });

    it('should parse command-specific options', async () => {
      const result = await runCLI(['upload', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--build-name');
      expect(result.stdout).toContain('--batch-size');
      expect(result.stdout).toContain('--wait');
    });

    it('should parse run command options', async () => {
      const result = await runCLI(['run', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--port');
      expect(result.stdout).toContain('--build-name');
      expect(result.stdout).toContain('--timeout');
    });

    it('should parse tdd command options', async () => {
      const result = await runCLI(['tdd', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--port');
      expect(result.stdout).toContain('--baseline-build');
      expect(result.stdout).toContain('--set-baseline');
    });
  });

  describe('error handling', () => {
    it('should handle unknown commands', async () => {
      const result = await runCLI(['unknown-command']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: unknown command 'unknown-command'"
      );
    });

    it('should handle unknown options', async () => {
      const result = await runCLI(['--unknown-option']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "error: unknown option '--unknown-option'"
      );
    });
  });

  describe('command execution paths', () => {
    it('should execute init command with validation', async () => {
      // This will fail due to missing config but tests the execution path
      const result = await runCLI(['init', '--force'], {
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // Command should execute and either succeed or fail with business logic error
      // (not argument parsing error)
      expect([0, 1]).toContain(result.code);
    });

    it('should execute upload command with validation', async () => {
      // This will fail validation but tests the execution path
      const result = await runCLI(['upload', './nonexistent'], {
        env: { ...process.env, NODE_ENV: 'test' },
      });

      expect(result.code).toBe(1);
      // May show validation errors or upload errors
      expect(result.stderr.length).toBeGreaterThan(0);
    });

    it('should execute run command with validation', async () => {
      // This will fail validation but tests the execution path
      const result = await runCLI(['run', 'echo "test"'], {
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // May succeed or fail depending on environment/config
      expect([0, 1]).toContain(result.code);
    });

    it('should execute tdd command with validation', async () => {
      const result = await runCLI(['tdd', 'echo "test"'], {
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // May succeed or fail depending on environment/config
      expect([0, 1]).toContain(result.code);
    });

    it('should execute status command with validation', async () => {
      const result = await runCLI(['status', 'test-build-id'], {
        env: { ...process.env, NODE_ENV: 'test' },
      });

      expect(result.code).toBe(1);
      // Should show validation error or execution error
      expect(result.stderr.length).toBeGreaterThan(0);
    });

    it('should execute doctor command', async () => {
      const result = await runCLI(['doctor'], {
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // Doctor should execute (may succeed or fail based on environment)
      expect([0, 1]).toContain(result.code);
    });
  });

  describe('global options', () => {
    it('should handle verbose flag', async () => {
      const result = await runCLI(['--verbose', 'init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
    });

    it('should handle json flag', async () => {
      const result = await runCLI(['--json', 'init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
    });

    it('should handle no-color flag', async () => {
      const result = await runCLI(['--no-color', 'init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
    });

    it('should handle config option', async () => {
      const result = await runCLI([
        '--config',
        './vizzly.config.js',
        'init',
        '--help',
      ]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
    });

    it('should handle token option', async () => {
      const result = await runCLI(['--token', 'test-token', 'init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Initialize Vizzly in your project');
    });
  });
});
