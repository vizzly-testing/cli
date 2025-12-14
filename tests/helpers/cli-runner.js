/**
 * Shared CLI runner for integration tests
 *
 * Spawns real CLI processes but with optimized settings to reduce
 * filesystem churn and process spawning overhead.
 *
 * Usage:
 *   import { runCLI, createCLIRunner } from '../helpers/cli-runner.js';
 *
 *   // Simple usage (creates temp dir per call)
 *   let result = await runCLI(['--help']);
 *
 *   // Optimized usage (reuses temp dir)
 *   let cli = createCLIRunner(tempDir);
 *   let result = await cli.run(['--help']);
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);

// Path to CLI entry point
let CLI_PATH = join(__dirname, '../../src/cli.js');

/**
 * Default environment for CLI tests
 * Isolated from user's real config and tokens
 */
function createCleanEnv(overrides = {}) {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    CI: 'true',
    // Disable dotenv to prevent .env file reading
    DOTENV_CONFIG_PATH: '/dev/null',
    // Force test API URL
    VIZZLY_API_URL: 'https://api.vizzly.dev/test',
    VIZZLY_SERVER_URL: 'https://api.vizzly.dev/test',
    // Remove any tokens
    VIZZLY_TOKEN: undefined,
    VIZZLY_API_KEY: undefined,
    // Pass through V8 coverage directory so child processes contribute to coverage
    NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE,
    ...overrides,
  };
}

/**
 * Run CLI command with isolated environment
 *
 * @param {string[]} args - CLI arguments
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory (defaults to temp)
 * @param {Object} [options.env] - Additional environment variables
 * @param {number} [options.timeout=10000] - Timeout in ms
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export async function runCLI(args, options = {}) {
  let { cwd, env = {}, timeout = process.env.CI ? 15000 : 10000 } = options;

  // Create temp directory if not provided
  if (!cwd) {
    cwd = join(tmpdir(), `vizzly-cli-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
  }

  let cleanEnv = createCleanEnv(env);

  return new Promise((resolve, reject) => {
    let child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
      cwd,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve({
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      }
    });

    child.on('error', error => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    let timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGTERM');
        reject(new Error(`CLI timed out after ${timeout}ms`));
      }
    }, timeout);
  });
}

/**
 * Create a CLI runner bound to a specific temp directory
 *
 * Use this when running multiple CLI commands in a test suite
 * to avoid creating a new temp directory per command.
 *
 * @param {string} cwd - Working directory for all commands
 * @param {Object} [baseEnv={}] - Base environment for all commands
 * @returns {Object} CLI runner object
 */
export function createCLIRunner(cwd, baseEnv = {}) {
  return {
    /**
     * Run CLI command
     * @param {string[]} args - CLI arguments
     * @param {Object} [options] - Additional options
     */
    async run(args, options = {}) {
      return runCLI(args, {
        cwd,
        env: { ...baseEnv, ...options.env },
        timeout: options.timeout,
      });
    },

    /**
     * Run CLI command expecting success (exit code 0)
     * @param {string[]} args - CLI arguments
     * @param {Object} [options] - Additional options
     * @throws {Error} If exit code is not 0
     */
    async runSuccess(args, options = {}) {
      let result = await this.run(args, options);
      if (result.code !== 0) {
        throw new Error(
          `CLI exited with code ${result.code}:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
        );
      }
      return result;
    },

    /**
     * Run CLI command expecting failure (exit code 1)
     * @param {string[]} args - CLI arguments
     * @param {Object} [options] - Additional options
     * @throws {Error} If exit code is 0
     */
    async runFailure(args, options = {}) {
      let result = await this.run(args, options);
      if (result.code === 0) {
        throw new Error(
          `CLI succeeded but expected failure:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
        );
      }
      return result;
    },
  };
}

/**
 * Parse JSON output from CLI (for --json mode)
 * @param {string} output - stdout or stderr from CLI
 * @returns {Object[]} Parsed JSON objects
 */
export function parseJSONOutput(output) {
  return output
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(obj => obj !== null);
}

/**
 * Find a specific JSON message type in output
 * @param {string} output - stdout or stderr from CLI
 * @param {string} status - Status to find (e.g., 'error', 'data', 'success')
 * @returns {Object|null} Found JSON object or null
 */
export function findJSONMessage(output, status) {
  let messages = parseJSONOutput(output);
  return messages.find(msg => msg.status === status) || null;
}
