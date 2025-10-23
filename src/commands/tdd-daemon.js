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
    ui.info(`Dev server already running at http://localhost:${port}`);
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

    // Show loading indicator if downloading baselines (but not in verbose mode since child shows progress)
    if (options.baselineBuild && !globalOptions.verbose) {
      ui.startSpinner(
        `Downloading baselines from build ${options.baselineBuild}...`
      );
    }

    // Spawn child process with stdio inherited during init for direct error visibility
    const child = spawn(
      process.execPath,
      [
        process.argv[1], // CLI entry point
        'tdd',
        'start',
        '--daemon-child', // Special flag for child process
        '--port',
        port.toString(),
        ...(options.open ? ['--open'] : []),
        ...(options.baselineBuild
          ? ['--baseline-build', options.baselineBuild]
          : []),
        ...(options.baselineComparison
          ? ['--baseline-comparison', options.baselineComparison]
          : []),
        ...(options.environment ? ['--environment', options.environment] : []),
        ...(options.threshold !== undefined
          ? ['--threshold', options.threshold.toString()]
          : []),
        ...(options.timeout ? ['--timeout', options.timeout] : []),
        ...(options.token ? ['--token', options.token] : []),
        ...(globalOptions.json ? ['--json'] : []),
        ...(globalOptions.verbose ? ['--verbose'] : []),
        ...(globalOptions.noColor ? ['--no-color'] : []),
      ],
      {
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        cwd: process.cwd(),
      }
    );

    // Wait for child to signal successful init or exit with error
    let initComplete = false;
    let initFailed = false;

    await new Promise(resolve => {
      // Child disconnects IPC when initialization succeeds
      child.on('disconnect', () => {
        initComplete = true;
        resolve();
      });

      // Child exits before disconnecting = initialization failed
      child.on('exit', () => {
        if (!initComplete) {
          initFailed = true;
          resolve();
        }
      });

      // Timeout after 30 seconds to prevent indefinite wait
      setTimeout(() => {
        if (!initComplete && !initFailed) {
          initFailed = true;
          resolve();
        }
      }, 30000);
    });

    if (initFailed) {
      if (options.baselineBuild && !globalOptions.verbose) {
        ui.stopSpinner();
      }
      ui.error('Dev server failed to start');
      process.exit(1);
    }

    // Unref so parent can exit
    child.unref();

    // Verify server started with retries
    const maxRetries = 10;
    const retryDelay = 200; // Start with 200ms
    let running = false;

    for (let i = 0; i < maxRetries && !running; i++) {
      await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
      running = await isServerRunning(port);
    }

    if (options.baselineBuild && !globalOptions.verbose) {
      ui.stopSpinner();
    }

    if (!running) {
      ui.error(
        'Failed to start dev server - server not responding to health checks'
      );
      process.exit(1);
    }

    ui.success(`Dev server started at http://localhost:${port}`);

    ui.info('');
    ui.info('Dashboard:');
    ui.info(`  http://localhost:${port}/`);
    ui.info('');
    ui.info('Available views:');
    ui.info(`  Comparisons: http://localhost:${port}/`);
    ui.info(`  Stats:       http://localhost:${port}/stats`);
    ui.info(`  Settings:    http://localhost:${port}/settings`);
    ui.info(`  Projects:    http://localhost:${port}/projects`);
    ui.info('');
    ui.info('Next steps:');
    ui.info('  1. Run your tests in watch mode (e.g., npm test -- --watch)');
    ui.info('  2. View live visual comparisons in the dashboard');
    ui.info('  3. Accept/reject baselines directly in the UI');
    ui.info('');
    ui.info('Stop server: npx vizzly dev stop');

    if (options.open) {
      openDashboard(port);
    }
  } catch (error) {
    ui.error('Failed to start TDD daemon', error);
    process.exit(1);
  }
}

/**
 * Internal function to run server in child process
 * This is called when --daemon-child flag is present
 * @private
 */
export async function runDaemonChild(options = {}, globalOptions = {}) {
  const vizzlyDir = join(process.cwd(), '.vizzly');
  const port = options.port || 47392;

  try {
    // Use existing tddCommand but with daemon mode
    const { cleanup } = await tddCommand(
      null, // No test command - server only
      {
        ...options,
        daemon: true,
      },
      globalOptions
    );

    // Disconnect IPC after successful initialization to signal parent
    if (process.send) {
      process.disconnect();
    }

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

    // Set up graceful shutdown
    const handleShutdown = async () => {
      try {
        // Clean up PID files
        if (existsSync(pidFile)) unlinkSync(pidFile);
        const serverFile = join(vizzlyDir, 'server.json');
        if (existsSync(serverFile)) unlinkSync(serverFile);

        // Use the cleanup function from tddCommand
        await cleanup();
      } catch {
        // Silent cleanup in daemon
      }

      process.exit(0);
    };

    // Register signal handlers
    process.on('SIGINT', () => handleShutdown());
    process.on('SIGTERM', () => handleShutdown());

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    // Most errors shown via inherited stdio, but catch any that weren't
    console.error(`Fatal error: ${error.message}`);
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
    ui.warning('No dev server running');

    // Clean up any stale files
    if (existsSync(pidFile)) unlinkSync(pidFile);
    if (existsSync(serverFile)) unlinkSync(serverFile);
    return;
  }

  try {
    // Try to kill the process gracefully
    process.kill(pid, 'SIGTERM');

    ui.info(`Stopping dev server (PID: ${pid})...`);

    // Give it a moment to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if it's still running
    try {
      process.kill(pid, 0); // Just check if process exists
      // If we get here, process is still running, force kill it
      process.kill(pid, 'SIGKILL');
      ui.info('Force killed dev server');
    } catch {
      // Process is gone, which is what we want
    }

    // Clean up files
    if (existsSync(pidFile)) unlinkSync(pidFile);
    if (existsSync(serverFile)) unlinkSync(serverFile);

    ui.success('Dev server stopped');
  } catch (error) {
    if (error.code === 'ESRCH') {
      // Process not found - clean up stale files
      ui.warning('Dev server was not running (cleaning up stale files)');
      if (existsSync(pidFile)) unlinkSync(pidFile);
      if (existsSync(serverFile)) unlinkSync(serverFile);
    } else {
      ui.error('Error stopping dev server', error);
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
    ui.info('Dev server not running');
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
      ui.success(`Dev server running (PID: ${pid})`);
      ui.info(`Dashboard: http://localhost:${serverInfo.port}/`);
      ui.info('');
      ui.info('Available views:');
      ui.info(`  Comparisons: http://localhost:${serverInfo.port}/`);
      ui.info(`  Stats:       http://localhost:${serverInfo.port}/stats`);
      ui.info(`  Settings:    http://localhost:${serverInfo.port}/settings`);
      ui.info(`  Projects:    http://localhost:${serverInfo.port}/projects`);

      if (serverInfo.startTime) {
        const uptime = Math.floor((Date.now() - serverInfo.startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        let uptimeStr = '';
        if (hours > 0) uptimeStr += `${hours}h `;
        if (minutes > 0 || hours > 0) uptimeStr += `${minutes}m `;
        uptimeStr += `${seconds}s`;
        ui.info('');
        ui.info(`Uptime: ${uptimeStr}`);
      }
    } else {
      ui.warning(
        'Dev server process exists but not responding to health checks'
      );
    }
  } catch (error) {
    if (error.code === 'ESRCH') {
      ui.warning('Dev server process not found (cleaning up stale files)');
      unlinkSync(pidFile);
      if (existsSync(serverFile)) {
        unlinkSync(serverFile);
      }
    } else {
      ui.error('Error checking dev server status', error);
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
