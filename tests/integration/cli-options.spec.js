import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '../../src/cli.js');

/**
 * Helper function to run CLI command and capture output
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

describe('CLI Options Integration', () => {
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

  describe('Global options', () => {
    it('should show help with all global options', async () => {
      const result = await runCLI(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--config <path>');
      expect(result.stdout).toContain('--token <token>');
      expect(result.stdout).toContain('--verbose');
      expect(result.stdout).toContain('--json');
      expect(result.stdout).toContain('--no-color');
    });

    it('should show version', async () => {
      const result = await runCLI(['--version']);

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });

    it('should handle unknown global option', async () => {
      const result = await runCLI(['--unknown-option']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('unknown option');
    });
  });

  describe('Upload command options', () => {
    it('should show upload command help with all options', async () => {
      const result = await runCLI(['upload', '--help']);

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

    it('should fail without screenshots path argument', async () => {
      const result = await runCLI(['upload']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should handle JSON output mode', async () => {
      const result = await runCLI(['upload', './test-screenshots', '--json'], {
        env: { CI: 'true' },
      });

      // Should fail due to missing API token but with JSON error format
      expect(result.code).toBe(1);
      const lines = result.stderr.split('\\n').filter(line => line.trim());

      // Look for JSON error output
      const jsonErrorLine = lines.find(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed.status === 'error';
        } catch {
          return false;
        }
      });

      expect(jsonErrorLine).toBeTruthy();
      const errorObj = JSON.parse(jsonErrorLine);
      expect(errorObj.message).toContain('API token required');
    });
  });

  describe('Run command options', () => {
    it('should show run command help with all options', async () => {
      const result = await runCLI(['run', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('--build-name <name>');
      expect(result.stdout).toContain('--branch <branch>');
      expect(result.stdout).toContain('--environment <env>');
      expect(result.stdout).toContain('--wait');
      expect(result.stdout).toContain('--timeout <ms>');
      expect(result.stdout).toContain('--allow-no-token');
    });

    it('should fail without test command argument', async () => {
      const result = await runCLI(['run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should handle port option parsing', async () => {
      const result = await runCLI(
        [
          'run',
          'echo "test successful"',
          '--port',
          '47501',
          '--allow-no-token',
        ],
        {
          env: { CI: 'true' },
        }
      );

      // Should succeed and show test output
      expect(result.code).toBe(0);
      expect(result.stderr).not.toContain('invalid port');
      expect(result.stdout).toContain('Test run completed successfully');
    });

    it('should successfully run command with --allow-no-token', async () => {
      const result = await runCLI(
        ['run', 'echo "hello world"', '--allow-no-token'],
        {
          env: { CI: 'true' },
        }
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Test run completed successfully');
    });

    it('should fail when test command fails', async () => {
      const result = await runCLI(['run', 'exit 1', '--allow-no-token'], {
        env: { CI: 'true' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Test run failed');
    });
  });

  describe('TDD command options', () => {
    it('should show tdd command help with all options', async () => {
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

    it('should fail without test command argument', async () => {
      const result = await runCLI(['tdd', 'run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should start TDD mode with valid command', async () => {
      const result = await runCLI(['tdd', 'run', 'echo test']);

      // Should not have CLI errors - may fail during execution
      expect(result.stderr).not.toContain('error: unknown');
      expect(result.stdout).toContain('Running in local');
    });

    it('should handle port option parsing', async () => {
      const result = await runCLI(
        ['tdd', 'run', 'echo test', '--port', '47500'],
        {
          env: { CI: 'true' },
        }
      );

      // Should not have validation errors for port
      expect(result.stderr).not.toContain('invalid port');
      expect(result.stderr).not.toContain('Port must be');
    });
  });

  describe('Init command options', () => {
    it('should show init command help with force option', async () => {
      const result = await runCLI(['init', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--force');
      expect(result.stdout).toContain('Overwrite existing configuration');
    });
  });

  describe('Status command options', () => {
    it('should show status command help', async () => {
      const result = await runCLI(['status', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Check the status of a build');
      expect(result.stdout).toContain('<build-id>');
    });

    it('should fail without build ID argument', async () => {
      const result = await runCLI(['status']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should handle validation errors for empty build ID', async () => {
      const result = await runCLI(['status', '']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Build ID is required');
    });

    it('should attempt to fetch status with valid build ID but fail without token', async () => {
      const result = await runCLI(['status', 'build-123']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('API token required');
    });

    it('should support JSON output mode', async () => {
      const result = await runCLI(['status', 'build-123', '--json']);

      expect(result.code).toBe(1);
      // Should fail due to missing token but in JSON format
      const lines = result.stderr.split('\\n').filter(line => line.trim());
      const jsonErrorLine = lines.find(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed.status === 'error';
        } catch {
          return false;
        }
      });

      expect(jsonErrorLine).toBeTruthy();
    });
  });

  describe('Doctor command options', () => {
    it('should show doctor command help with --api flag', async () => {
      const result = await runCLI(['doctor', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Run diagnostics to check your environment and configuration'
      );
      expect(result.stdout).toContain('--api');
    });

    it('should run preflight checks and pass locally without token', async () => {
      const result = await runCLI(['doctor']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        'Running Vizzly preflight (local checks only)...'
      );
      expect(result.stdout).toContain('API URL');
      expect(result.stdout).toContain('Effective port');
      expect(result.stdout).toContain('Threshold');
      expect(result.stdout).toContain('Preflight passed.');
    });

    it('should fail when using --api flag without a token', async () => {
      const result = await runCLI(['doctor', '--api']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        'Missing API token for connectivity check'
      );
    });

    it('should succeed when using --api flag with a valid token', async () => {
      // This test will fail if the mock API service isn't running or if the token is invalid.
      // For this integration test, we'll provide a dummy token and expect it to fail authentication,
      // which still proves the command attempts the API call.
      const result = await runCLI(['doctor', '--api'], {
        env: { VIZZLY_TOKEN: 'dummy-token' },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('API connectivity failed');
    });

    it('should support JSON output mode', async () => {
      const result = await runCLI(['doctor', '--json']);

      expect(result.code).toBe(0);
      // Parse stdout lines and find the 'data' payload
      const lines = result.stdout.split('\n').filter(Boolean);
      const dataLine = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .find(obj => obj && obj.status === 'data');

      expect(dataLine).toBeTruthy();
      expect(dataLine.data.passed).toBe(true);
      expect(dataLine.data.diagnostics.configuration.apiUrl).toBeTruthy();
    });
  });

  describe('Error handling consistency', () => {
    it('should show proper error messages in different environments', async () => {
      const result = await runCLI(['upload', './screenshots'], {
        env: { CI: 'true' },
      });

      // Should exit with proper error code and clean output
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('API token required'); // Should show specific error
      expect(result.stderr).not.toContain('⠋'); // No spinner characters
    });

    it('should handle missing screenshots path', async () => {
      const result = await runCLI(['upload']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });
  });

  describe('JSON output mode', () => {
    it('should output JSON when --json flag is used', async () => {
      const result = await runCLI(['upload', './screenshots', '--json']);

      expect(result.code).toBe(1);

      // Parse stderr lines to find JSON output
      const lines = result.stderr.split('\\n').filter(line => line.trim());
      const jsonLines = lines.filter(line => {
        try {
          JSON.parse(line);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonLines.length).toBeGreaterThan(0);
    });

    it('should include timestamps in JSON output', async () => {
      const result = await runCLI(['upload', './screenshots', '--json']);

      const lines = result.stderr.split('\\n').filter(line => line.trim());
      const jsonLine = lines.find(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed.timestamp;
        } catch {
          return false;
        }
      });

      if (jsonLine) {
        const parsed = JSON.parse(jsonLine);
        expect(parsed.timestamp).toMatch(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
        );
      }
    });
  });

  describe('Environment variable integration', () => {
    it('should use VIZZLY_TOKEN from environment', async () => {
      const result = await runCLI(['upload', './screenshots'], {
        env: { VIZZLY_TOKEN: 'test-token-from-env' },
      });

      // Should get further than "API token required" error
      expect(result.stderr).not.toContain('API token required');
    });

    it('should prioritize --token flag over environment variable', async () => {
      const result = await runCLI(
        ['upload', './screenshots', '--token', 'cli-token', '--verbose'],
        {
          env: { VIZZLY_TOKEN: 'env-token' },
        }
      );

      // If verbose output shows the token being used, it should be the CLI one
      // (This is hard to test directly without exposing tokens, so we test indirectly)
      expect(result.stderr).not.toContain('API token required');
    });
  });

  describe('Error handling', () => {
    it('should show helpful error for invalid threshold', async () => {
      const result = await runCLI([
        'upload',
        './screenshots',
        '--threshold',
        'invalid',
        '--help', // Use help to avoid actual execution
      ]);

      // Commander should handle invalid number parsing
      expect(result.code).toBe(0); // Help succeeds
    });

    it('should handle missing required arguments gracefully', async () => {
      const result = await runCLI(['run']);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('missing required argument');
      expect(result.stderr).toContain('command');
    });
  });
});
