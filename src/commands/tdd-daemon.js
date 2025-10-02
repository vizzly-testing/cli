import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { ConsoleUI } from '../utils/console-ui.js';
import { tddCommand } from './tdd.js';

/**
 * Start TDD server in daemon mode
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function tddStartCommand(options = {}, globalOptions = {}) {
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  // Check if server already running
  if (await isServerRunning(options.port || 47392)) {
    const port = options.port || 47392;
    ui.info(`TDD server already running at http://localhost:${port}`);
    ui.info(`Dashboard: http://localhost:${port}/dashboard`);

    if (options.open) {
      openDashboard(port);
    }
    return;
  }

  try {
    // Ensure .vizzly directory exists
    const vizzlyDir = join(process.cwd(), '.vizzly');
    if (!existsSync(vizzlyDir)) {
      mkdirSync(vizzlyDir, { recursive: true });
    }

    const port = options.port || 47392;

    // Use existing tddCommand but with daemon mode - this will start and keep running
    const { cleanup } = await tddCommand(
      null, // No test command - server only
      {
        ...options,
        daemon: true, // Flag to indicate daemon mode
      },
      globalOptions
    );

    // The server is now running in this process
    // Store our PID for the stop command
    const pidFile = join(vizzlyDir, 'server.pid');
    writeFileSync(pidFile, process.pid.toString());

    const serverInfo = {
      pid: process.pid,
      port: port,
      startTime: Date.now(),
    };
    writeFileSync(
      join(vizzlyDir, 'server.json'),
      JSON.stringify(serverInfo, null, 2)
    );

    ui.success(`TDD server started at http://localhost:${port}`);
    ui.info('');
    ui.info('Dashboard URLs:');
    ui.info(`  Comparisons: http://localhost:${port}/`);
    ui.info(`  Stats:       http://localhost:${port}/stats`);
    ui.info('');
    ui.info('Next steps:');
    ui.info('  1. Run your tests (any test runner)');
    ui.info('  2. Open the dashboard in your browser');
    ui.info('  3. Manage baselines in the Stats view');
    ui.info('');
    ui.info('Stop server: npx vizzly tdd stop');

    if (options.open) {
      openDashboard(port);
    }

    // Set up graceful shutdown
    const handleShutdown = async signal => {
      ui.info(`\nReceived ${signal}, shutting down gracefully...`);

      try {
        // Clean up PID files
        if (existsSync(pidFile)) unlinkSync(pidFile);
        const serverFile = join(vizzlyDir, 'server.json');
        if (existsSync(serverFile)) unlinkSync(serverFile);

        // Use the cleanup function from tddCommand
        await cleanup();

        ui.success('TDD server stopped');
      } catch (error) {
        ui.error('Error during shutdown:', error);
      }

      process.exit(0);
    };

    // Register signal handlers
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    ui.error('Failed to start TDD daemon', error);
    process.exit(1);
  }
}

/**
 * Stop TDD daemon server
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function tddStopCommand(options = {}, globalOptions = {}) {
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  const vizzlyDir = join(process.cwd(), '.vizzly');
  const pidFile = join(vizzlyDir, 'server.pid');
  const serverFile = join(vizzlyDir, 'server.json');

  // First try to find process by PID file
  let pid = null;
  if (existsSync(pidFile)) {
    try {
      pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    } catch {
      // Invalid PID file
    }
  }

  // If no PID file or invalid, try to find by port using lsof
  const port = options.port || 47392;
  if (!pid) {
    try {
      const lsofProcess = spawn('lsof', ['-ti', `:${port}`], { stdio: 'pipe' });

      let lsofOutput = '';
      lsofProcess.stdout.on('data', data => {
        lsofOutput += data.toString();
      });

      await new Promise(resolve => {
        lsofProcess.on('close', code => {
          if (code === 0 && lsofOutput.trim()) {
            const foundPid = parseInt(lsofOutput.trim().split('\n')[0], 10);
            if (foundPid && !isNaN(foundPid)) {
              pid = foundPid;
            }
          }
          resolve();
        });

        lsofProcess.on('error', () => {
          // lsof not available, that's ok
          resolve();
        });
      });
    } catch {
      // lsof failed, that's ok too
    }
  }

  if (!pid) {
    ui.warning('No TDD server running');

    // Clean up any stale files
    if (existsSync(pidFile)) unlinkSync(pidFile);
    if (existsSync(serverFile)) unlinkSync(serverFile);
    return;
  }

  try {
    // Try to kill the process gracefully
    process.kill(pid, 'SIGTERM');

    ui.info(`Stopping TDD server (PID: ${pid})...`);

    // Give it a moment to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if it's still running
    try {
      process.kill(pid, 0); // Just check if process exists
      // If we get here, process is still running, force kill it
      process.kill(pid, 'SIGKILL');
      ui.info('Force killed TDD server');
    } catch {
      // Process is gone, which is what we want
    }

    // Clean up files
    if (existsSync(pidFile)) unlinkSync(pidFile);
    if (existsSync(serverFile)) unlinkSync(serverFile);

    ui.success('TDD server stopped');
  } catch (error) {
    if (error.code === 'ESRCH') {
      // Process not found - clean up stale files
      ui.warning('TDD server was not running (cleaning up stale files)');
      if (existsSync(pidFile)) unlinkSync(pidFile);
      if (existsSync(serverFile)) unlinkSync(serverFile);
    } else {
      ui.error('Error stopping TDD server', error);
    }
  }
}

/**
 * Check TDD daemon server status
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function tddStatusCommand(options, globalOptions = {}) {
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  const vizzlyDir = join(process.cwd(), '.vizzly');
  const pidFile = join(vizzlyDir, 'server.pid');
  const serverFile = join(vizzlyDir, 'server.json');

  if (!existsSync(pidFile)) {
    ui.info('TDD server not running');
    return;
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);

    // Check if process is actually running
    process.kill(pid, 0); // Signal 0 just checks if process exists

    let serverInfo = { port: 47392 };
    if (existsSync(serverFile)) {
      serverInfo = JSON.parse(readFileSync(serverFile, 'utf8'));
    }

    // Try to check health endpoint
    const health = await checkServerHealth(serverInfo.port);

    if (health.running) {
      ui.success(`TDD server running (PID: ${pid})`);
      ui.info(`Server: http://localhost:${serverInfo.port}`);
      ui.info(`Dashboard: http://localhost:${serverInfo.port}/dashboard`);

      if (serverInfo.startTime) {
        const uptime = Math.floor((Date.now() - serverInfo.startTime) / 1000);
        ui.info(`Uptime: ${uptime} seconds`);
      }
    } else {
      ui.warning(
        'TDD server process exists but not responding to health checks'
      );
    }
  } catch (error) {
    if (error.code === 'ESRCH') {
      ui.warning('TDD server process not found (cleaning up stale files)');
      unlinkSync(pidFile);
      if (existsSync(serverFile)) {
        unlinkSync(serverFile);
      }
    } else {
      ui.error('Error checking TDD server status', error);
    }
  }
}

/**
 * Check if server is running on given port
 * @private
 */
async function isServerRunning(port = 47392) {
  try {
    const health = await checkServerHealth(port);
    return health.running;
  } catch {
    return false;
  }
}

/**
 * Check server health endpoint
 * @private
 */
async function checkServerHealth(port = 47392) {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    const data = await response.json();
    return {
      running: response.ok,
      port: data.port,
      uptime: data.uptime,
    };
  } catch {
    return { running: false };
  }
}

/**
 * Open dashboard in default browser
 * @private
 */
function openDashboard(port = 47392) {
  const url = `http://localhost:${port}/dashboard`;

  // Cross-platform open command
  let openCmd;
  if (process.platform === 'darwin') {
    openCmd = 'open';
  } else if (process.platform === 'win32') {
    openCmd = 'start';
  } else {
    openCmd = 'xdg-open';
  }

  spawn(openCmd, [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}
