/**
 * Diagnostics utilities for the doctor command
 */
import { spawn } from 'child_process';
import { access, constants } from 'fs/promises';
import { getApiToken } from './environment-config.js';

/**
 * Check if required dependencies are available
 */
export async function checkDependencies() {
  const dependencies = {
    node: await checkNodeVersion(),
    npm: await checkCommandAvailable('npm'),
    git: await checkCommandAvailable('git'),
    odiff: await checkOdiffBinary(),
  };

  const allOk = Object.values(dependencies).every(dep => dep.available);

  return {
    all_ok: allOk,
    details: dependencies,
  };
}

/**
 * Check Node.js version
 */
async function checkNodeVersion() {
  try {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0]);
    const supported = majorVersion >= 20;

    return {
      available: true,
      version,
      supported,
      message: supported ? 'OK' : 'Node.js 20+ required',
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
}

/**
 * Check if a command is available
 */
async function checkCommandAvailable(command) {
  return new Promise(resolve => {
    const child = spawn(command, ['--version'], { stdio: 'pipe' });

    let output = '';
    child.stdout.on('data', data => {
      output += data.toString();
    });

    child.on('close', code => {
      resolve({
        available: code === 0,
        version: output.trim().split('\n')[0] || 'Unknown',
        message: code === 0 ? 'OK' : `Command '${command}' not found`,
      });
    });

    child.on('error', () => {
      resolve({
        available: false,
        message: `Command '${command}' not found`,
      });
    });
  });
}

/**
 * Check if odiff binary is available
 */
async function checkOdiffBinary() {
  try {
    // Check if odiff-bin package is installed and binary is accessible
    const { findOdiffBin } = await import('odiff-bin');
    const odiffPath = findOdiffBin();

    await access(odiffPath, constants.F_OK | constants.X_OK);

    return {
      available: true,
      path: odiffPath,
      message: 'OK',
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      message: 'odiff binary not found or not executable',
    };
  }
}

/**
 * Check API connectivity
 */

export async function checkApiConnectivity(config) {
  try {
    const apiUrl = config?.apiUrl || 'https://vizzly.dev';
    const apiKey = config?.apiKey || getApiToken();

    // Basic URL validation
    try {
      new globalThis.URL(apiUrl);
    } catch {
      throw new Error(`Invalid API URL: ${apiUrl}`);
    }

    const result = {
      url: apiUrl,
      has_token: !!apiKey,
      reachable: false,
      authenticated: false,
    };

    // Try to reach the API
    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      });

      result.reachable = response.ok;
      result.status_code = response.status;

      // Test authentication if we have a token
      if (apiKey && result.reachable) {
        const authResponse = await fetch(`${apiUrl}/api/user`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        });

        result.authenticated = authResponse.ok;
        result.auth_status_code = authResponse.status;
      }
    } catch (fetchError) {
      result.reachable = false;
      result.error = fetchError.message;
    }

    return result;
  } catch (error) {
    return {
      error: error.message,
      reachable: false,
      authenticated: false,
    };
  }
}

/**
 * Check terminal capabilities
 */
export function checkTerminalCapabilities() {
  return {
    stdout_is_tty: Boolean(process.stdout.isTTY),
    stdin_is_tty: Boolean(process.stdin.isTTY),
    supports_color: Boolean(
      process.stdout.isTTY && process.env.TERM !== 'dumb'
    ),
    terminal_type: process.env.TERM || 'unknown',
    columns: process.stdout.columns || 0,
    rows: process.stdout.rows || 0,
  };
}

/**
 * Get system information
 */
export function getSystemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    memory_usage: process.memoryUsage(),
    uptime: process.uptime(),
    working_directory: process.cwd(),
  };
}
