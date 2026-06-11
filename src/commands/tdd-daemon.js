import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { getServerRegistry } from '../tdd/server-registry.js';
import { withTimeout } from '../utils/async-utils.js';
import * as output from '../utils/output.js';
import { tddCommand } from './tdd.js';
import {
  parsePositiveInteger,
  readDaemonPidFile,
  resolveDaemonPid,
  waitForProcessExit,
} from './tdd-daemon-process.js';

export {
  findDaemonPidByPort,
  readDaemonPidFile,
  resolveDaemonPid,
  waitForProcessExit,
} from './tdd-daemon-process.js';

let defaultTimers = { setTimeout, clearTimeout };

export function getLocalDaemonFiles(directory = process.cwd()) {
  let vizzlyDir = join(directory, '.vizzly');
  return {
    vizzlyDir,
    pidFile: join(vizzlyDir, 'server.pid'),
    serverFile: join(vizzlyDir, 'server.json'),
    logFile: join(vizzlyDir, 'server.log'),
  };
}

export function removeFileIfExists(filePath, deps = {}) {
  let fileExists = deps.existsSync || existsSync;
  let unlinkFile = deps.unlinkSync || unlinkSync;

  if (fileExists(filePath)) {
    unlinkFile(filePath);
    return true;
  }

  return false;
}

export function cleanupLocalDaemonFiles(directory = process.cwd(), deps = {}) {
  let { pidFile, serverFile } = getLocalDaemonFiles(directory);
  return {
    pidFileRemoved: removeFileIfExists(pidFile, deps),
    serverFileRemoved: removeFileIfExists(serverFile, deps),
  };
}

export function readLocalDaemonInfo(directory = process.cwd(), deps = {}) {
  let { serverFile } = getLocalDaemonFiles(directory);
  let fileExists = deps.existsSync || existsSync;
  let readFile = deps.readFileSync || readFileSync;

  if (!fileExists(serverFile)) {
    return null;
  }

  try {
    let info = JSON.parse(readFile(serverFile, 'utf8'));
    let port = parsePositiveInteger(info.port);
    let pid = parsePositiveInteger(info.pid);

    if (!port) {
      return null;
    }

    return {
      ...info,
      port,
      pid,
    };
  } catch {
    return null;
  }
}

export function buildLegacyServerInfo({
  pid,
  port,
  failOnDiff = false,
  now = Date.now,
}) {
  return {
    pid,
    port: port.toString(),
    startTime: now(),
    failOnDiff,
  };
}

function getLegacyGlobalServerFile({
  home = homedir,
  vizzlyHome = process.env.VIZZLY_HOME,
} = {}) {
  if (vizzlyHome) {
    return join(vizzlyHome, 'server.json');
  }

  return join(home(), '.vizzly', 'server.json');
}

export function writeLegacyGlobalServerFile(
  { pid, port, failOnDiff = false },
  {
    home = homedir,
    vizzlyHome = process.env.VIZZLY_HOME,
    exists = existsSync,
    mkdir = mkdirSync,
    writeFile = writeFileSync,
    now = Date.now,
  } = {}
) {
  let globalServerFile = getLegacyGlobalServerFile({ home, vizzlyHome });
  let globalVizzlyDir = dirname(globalServerFile);
  if (!exists(globalVizzlyDir)) {
    mkdir(globalVizzlyDir, { recursive: true });
  }

  let serverInfo = buildLegacyServerInfo({ pid, port, failOnDiff, now });
  writeFile(globalServerFile, JSON.stringify(serverInfo, null, 2));
  return { path: globalServerFile, serverInfo };
}

export function cleanupLegacyGlobalServerFile({
  home = homedir,
  vizzlyHome = process.env.VIZZLY_HOME,
  exists = existsSync,
  unlink = unlinkSync,
} = {}) {
  let globalServerFile = getLegacyGlobalServerFile({ home, vizzlyHome });
  return removeFileIfExists(globalServerFile, {
    existsSync: exists,
    unlinkSync: unlink,
  });
}

export function unregisterDaemonServer({
  port,
  directory = process.cwd(),
  registry = getServerRegistry(),
}) {
  registry.unregister({ port, directory });
}

export function cleanupDaemonState({
  port,
  directory = process.cwd(),
  registry = getServerRegistry(),
  localFileDeps = {},
  legacyFileDeps = {},
  cleanLocalFiles = true,
} = {}) {
  let localFiles = cleanLocalFiles
    ? cleanupLocalDaemonFiles(directory, localFileDeps)
    : {
        pidFileRemoved: false,
        serverFileRemoved: false,
      };
  let legacyGlobalServerFileRemoved =
    cleanupLegacyGlobalServerFile(legacyFileDeps);

  try {
    if (port !== undefined) {
      unregisterDaemonServer({ port, directory, registry });
    } else {
      registry.unregister({ directory });
    }
  } catch {
    // Non-fatal; stale file cleanup is still useful on its own.
  }

  return {
    ...localFiles,
    legacyGlobalServerFileRemoved,
  };
}

function resolveDaemonTarget(options = {}, directory = process.cwd()) {
  let registry = getServerRegistry();
  let requestedPort = options.port ? Number(options.port) : null;
  let localInfo = readLocalDaemonInfo(directory);
  let localInfoMatches =
    !requestedPort || localInfo?.port === requestedPort ? localInfo : null;
  let registryServer = requestedPort
    ? registry.find({ port: requestedPort })
    : registry.find({ directory });
  let serverInfo =
    localInfoMatches ||
    registryServer ||
    (requestedPort ? { port: requestedPort } : null);
  let port = requestedPort || serverInfo?.port || 47392;

  return {
    registry,
    requestedPort,
    localInfo: localInfoMatches,
    registryServer,
    serverInfo,
    port,
    directory: registryServer?.directory || directory,
    useLocalPidFile: !requestedPort || Boolean(localInfoMatches),
    cleanLocalFiles:
      !requestedPort || Boolean(localInfoMatches || registryServer),
  };
}

function cleanupDaemonTarget(target) {
  return cleanupDaemonState({
    port: target.port,
    directory: target.directory,
    registry: target.registry,
    cleanLocalFiles: target.cleanLocalFiles,
  });
}

export function buildDashboardUrl(port = 47392) {
  return `http://localhost:${port}`;
}

export function buildOpenDashboardCommand(url, platform = process.platform) {
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }

  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }

  return { command: 'xdg-open', args: [url] };
}

function wait(ms, timers = defaultTimers) {
  return new Promise(resolve => {
    timers.setTimeout(resolve, ms);
  });
}

export function buildDaemonChildArgs({
  entrypoint = process.argv[1],
  port,
  options = {},
  globalOptions = {},
}) {
  return [
    entrypoint,
    'tdd',
    'start',
    '--daemon-child',
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
    ...(options.minClusterSize !== undefined
      ? ['--min-cluster-size', options.minClusterSize.toString()]
      : []),
    ...(options.timeout ? ['--timeout', options.timeout] : []),
    ...(options.failOnDiff ? ['--fail-on-diff'] : []),
    ...(options.token ? ['--token', options.token] : []),
    ...(globalOptions.json ? ['--json'] : []),
    ...(globalOptions.verbose ? ['--verbose'] : []),
    ...(globalOptions.noColor ? ['--no-color'] : []),
  ];
}

export function validateTddStartOptions(options = {}) {
  let errors = [];

  if (options.port) {
    let port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('Port must be a valid number between 1 and 65535');
    }
  }

  if (options.timeout) {
    let timeout = Number(options.timeout);
    if (!Number.isInteger(timeout) || timeout < 1000) {
      errors.push('Timeout must be at least 1000 milliseconds');
    }
  }

  if (options.threshold !== undefined) {
    let threshold = Number(options.threshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      errors.push(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    }
  }

  if (options.minClusterSize !== undefined) {
    let minClusterSize = Number(options.minClusterSize);
    if (!Number.isInteger(minClusterSize) || minClusterSize < 1) {
      errors.push('Min cluster size must be a positive integer');
    }
  }

  return errors;
}

export async function waitForDaemonChildInit(
  child,
  { timeoutMs = 30000, timers = defaultTimers } = {}
) {
  let cleanup = () => {};
  let stderrOutput = '';
  let initPromise = new Promise(resolve => {
    let handleStderr = data => {
      stderrOutput += data.toString();
    };

    let handleMessage = message => {
      if (message?.type !== 'error') {
        return;
      }

      let error = new Error(message.message || 'Daemon child failed to start');
      if (message.code) {
        error.code = message.code;
      }
      if (message.stack) {
        error.stack = message.stack;
      }

      cleanup();
      resolve({
        ok: false,
        reason: 'error',
        error,
      });
    };

    let handleDisconnect = () => {
      cleanup();
      resolve({ ok: true });
    };

    let handleExit = (code, signal) => {
      let error = new Error(
        stderrOutput.trim() || 'Daemon child exited before startup'
      );
      error.code = code ?? signal ?? null;
      cleanup();
      resolve({ ok: false, reason: 'exit', error });
    };

    cleanup = () => {
      child.stderr?.off?.('data', handleStderr);
      child.off('message', handleMessage);
      child.off('disconnect', handleDisconnect);
      child.off('exit', handleExit);
    };

    child.stderr?.on?.('data', handleStderr);
    child.on('message', handleMessage);
    child.on('disconnect', handleDisconnect);
    child.on('exit', handleExit);
  });

  try {
    let result = await withTimeout(
      initPromise,
      timeoutMs,
      'TDD server initialization timed out',
      timers
    );
    if (result.ok) {
      child.stderr?.unref?.();
    }
    return result;
  } catch (error) {
    cleanup();
    return { ok: false, reason: 'timeout', error };
  }
}

export async function waitForServerRunning(
  port,
  {
    maxAttempts = 10,
    delayMs = 200,
    isRunning = isServerRunning,
    timers = defaultTimers,
  } = {}
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await isRunning(port)) {
      return true;
    }

    if (attempt < maxAttempts - 1) {
      await wait(delayMs * (attempt + 1), timers);
    }
  }

  return false;
}

/**
 * Start TDD server in daemon mode
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function tddStartCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let registry = getServerRegistry();
  let colors = output.getColors();

  // Check if THIS directory already has a server running
  let existingServer = registry.find({ directory: process.cwd() });
  if (existingServer) {
    // Verify it's actually running
    if (await isServerRunning(existingServer.port)) {
      // JSON output for already running
      if (globalOptions.json) {
        output.data({
          status: 'already_running',
          port: existingServer.port,
          pid: existingServer.pid,
          dashboardUrl: buildDashboardUrl(existingServer.port),
        });
        return;
      }

      output.header('tdd', 'local');
      output.print(`  ${output.statusDot('success')} Already running`);
      output.blank();
      output.printBox(
        colors.brand.info(
          colors.underline(`http://localhost:${existingServer.port}`)
        ),
        {
          title: 'Dashboard',
          style: 'branded',
        }
      );

      if (options.open) {
        openDashboard(existingServer.port);
      }
      return;
    } else {
      // Stale entry - clean it up (registry and local files)
      cleanupDaemonState({ directory: process.cwd(), registry });
    }
  }

  // Determine port: user-specified or auto-allocate
  let port;
  let autoAllocated = false;

  if (options.port) {
    // User specified a port - use it (will fail if busy)
    port = Number(options.port);

    // Check if user-specified port is in use
    if (await isServerRunning(port)) {
      output.header('tdd', 'local');
      output.print(
        `  ${output.statusDot('error')} Port ${port} is already in use`
      );
      output.blank();
      output.hint('Try a different port: vizzly tdd start --port 47393');
      output.hint('Or let Vizzly auto-allocate: vizzly tdd start');
      return;
    }
  } else {
    // Auto-allocate an available port
    // Note: There's a small race window between finding a port and binding.
    // The registry acts as a soft reservation, and findAvailablePort does
    // an actual TCP bind test to minimize this window.
    port = await registry.findAvailablePort();
    autoAllocated = port !== 47392;
  }

  try {
    // Ensure .vizzly directory exists
    let { vizzlyDir } = getLocalDaemonFiles();
    if (!existsSync(vizzlyDir)) {
      mkdirSync(vizzlyDir, { recursive: true });
    }

    // Show header first so debug messages appear below it
    output.header('tdd', 'local');

    // Show loading indicator if downloading baselines (but not in verbose mode since child shows progress)
    if (options.baselineBuild && !globalOptions.verbose) {
      output.startSpinner(
        `Downloading baselines from build ${options.baselineBuild}...`
      );
    }

    // Keep daemon stdio detached so callers that capture output do not hang
    // waiting for the long-lived child to close inherited pipes.
    let child = spawn(
      process.execPath,
      buildDaemonChildArgs({ port, options, globalOptions }),
      {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        cwd: process.cwd(),
      }
    );

    let initResult = await waitForDaemonChildInit(child);

    if (!initResult.ok) {
      if (options.baselineBuild && !globalOptions.verbose) {
        output.stopSpinner();
      }
      output.error(initResult.error?.message || 'TDD server failed to start');
      process.exit(1);
    }

    // Unref so parent can exit
    child.unref();

    // Verify server started with retries
    let running = await waitForServerRunning(port);

    if (options.baselineBuild && !globalOptions.verbose) {
      output.stopSpinner();
    }

    if (!running) {
      output.error(
        'Failed to start TDD server - server not responding to health checks'
      );
      process.exit(1);
    }

    // Register server in global registry (for menubar app)
    try {
      let registry = getServerRegistry();

      // Clean up any stale servers first
      registry.cleanupStale();

      // Register this server with log file path for menubar to read
      let { logFile } = getLocalDaemonFiles();
      registry.register({
        pid: child.pid,
        port: port,
        directory: process.cwd(),
        name: basename(process.cwd()),
        startedAt: new Date().toISOString(),
        logFile,
      });
    } catch {
      // Non-fatal
    }

    // Also write legacy server.json for SDK discovery (backwards compatibility)
    try {
      writeLegacyGlobalServerFile({
        pid: child.pid,
        port,
        failOnDiff: options.failOnDiff || false,
      });
    } catch {
      // Non-fatal, SDK can still use health check
    }

    // JSON output for successful start
    let dashboardUrl = buildDashboardUrl(port);
    if (globalOptions.json) {
      output.data({
        status: 'started',
        port,
        pid: child.pid,
        dashboardUrl,
      });
      if (options.open) {
        openDashboard(port);
      }
      return;
    }

    // Show auto-allocated port message if applicable
    if (autoAllocated) {
      output.print(
        `  ${output.statusDot('info')} Auto-assigned port ${colors.brand.textTertiary(`:${port}`)}`
      );
      output.blank();
    }

    // Show dashboard URL in a branded box
    output.printBox(colors.brand.info(colors.underline(dashboardUrl)), {
      title: 'Dashboard',
      style: 'branded',
    });

    // Verbose mode: show next steps
    if (globalOptions.verbose) {
      output.blank();
      output.print(`  ${colors.brand.textTertiary('Next steps')}`);
      output.print(
        `    ${colors.brand.textMuted('1.')} Run tests in watch mode ${colors.brand.textMuted('(pnpm test -- --watch)')}`
      );
      output.print(
        `    ${colors.brand.textMuted('2.')} Review visual changes in the dashboard`
      );
      output.print(
        `    ${colors.brand.textMuted('3.')} Accept or reject baseline updates`
      );
    }

    // Always show stop hint
    output.blank();
    let stopCommand =
      port === 47392 ? 'vizzly tdd stop' : `vizzly tdd stop --port ${port}`;
    output.hint(`Stop with: ${stopCommand}`);

    if (options.open) {
      openDashboard(port);
    }
  } catch (error) {
    output.error('Failed to start TDD daemon', error);
    process.exit(1);
  }
}

/**
 * Internal function to run server in child process
 * This is called when --daemon-child flag is present
 * @private
 */
export async function runDaemonChild(options = {}, globalOptions = {}) {
  let { pidFile, serverFile, logFile } = getLocalDaemonFiles();
  let port = options.port || 47392;

  // Configure output to write JSON logs to file (before tddCommand configures it)
  output.configure({
    logFile,
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Use existing tddCommand but with daemon mode
    let { result, cleanup } = await tddCommand(
      null, // No test command - server only
      {
        ...options,
        daemon: true,
      },
      globalOptions
    );

    if (result?.success === false) {
      throw new Error(result.error || 'TDD server failed to start');
    }

    // Disconnect IPC after successful initialization to signal parent
    if (process.send) {
      process.disconnect();
    }

    // Store our PID for the stop command
    writeFileSync(pidFile, process.pid.toString());

    let serverInfo = {
      pid: process.pid,
      port: port,
      startTime: Date.now(),
      failOnDiff: options.failOnDiff || false,
      logFile,
    };
    writeFileSync(serverFile, JSON.stringify(serverInfo, null, 2));

    // Set up graceful shutdown
    let handleShutdown = async () => {
      try {
        cleanupDaemonState({ port });

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
    await sendDaemonChildError(error);
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

async function sendDaemonChildError(error) {
  if (!process.send) {
    return;
  }

  let message = {
    type: 'error',
    message: error.message,
    code: error.code || null,
    stack: error.stack || null,
  };

  await new Promise(resolve => {
    try {
      process.send(message, () => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * Stop TDD daemon server
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function tddStopCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let target = resolveDaemonTarget(options);
  let pid = target.useLocalPidFile
    ? await resolveDaemonPid({ port: target.port })
    : null;

  // Stop is intentionally file/registry-driven. Do not rediscover arbitrary
  // processes by port here; a non-Vizzly server may be using that port.
  if (!pid) {
    pid = target.serverInfo?.pid || null;
  }

  if (!pid) {
    // JSON output for not running
    if (globalOptions.json) {
      output.data({
        status: 'not_running',
        message: 'No TDD server running',
      });
    } else {
      output.warn('No TDD server running');
    }

    // Clean up any stale files
    cleanupDaemonTarget(target);
    return;
  }

  try {
    // Try to kill the process gracefully
    process.kill(pid, 'SIGTERM');

    output.startSpinner('Stopping TDD server...');

    let exited = await waitForProcessExit(pid);

    // Check if it's still running
    if (!exited) {
      process.kill(pid, 'SIGKILL');
      output.stopSpinner();
      output.debug('tdd', 'Force killed process');
    } else {
      // Process is gone, which is what we want
      output.stopSpinner();
    }

    // Clean up files
    cleanupDaemonTarget(target);

    // JSON output for successful stop
    if (globalOptions.json) {
      output.data({
        status: 'stopped',
        pid,
        port: target.port,
      });
      return;
    }

    output.print(`  ${output.statusDot('success')} Server stopped`);
  } catch (error) {
    if (error.code === 'ESRCH') {
      // Process not found - clean up stale files
      cleanupDaemonTarget(target);
      if (globalOptions.json) {
        output.data({
          status: 'stale',
          stopped: false,
          message: 'TDD server was not running; cleaned up stale files',
        });
        return;
      }
      output.warn('TDD server was not running (cleaning up stale files)');
    } else {
      output.error('Error stopping TDD server', error);
    }
  }
}

/**
 * Check TDD daemon server status
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
function printRunningStatus({
  serverInfo,
  port,
  pid,
  uptimeMs = null,
  uptimeStr = '',
  dashboardUrl = buildDashboardUrl(port),
  globalOptions = {},
}) {
  if (globalOptions.json) {
    output.data({
      running: true,
      port,
      pid,
      uptimeMs,
      uptime: uptimeStr || null,
      dashboardUrl,
    });
    return;
  }

  let colors = output.getColors();

  output.header('tdd', 'local');
  output.print(
    `  ${output.statusDot('success')} Running ${uptimeStr ? colors.brand.textTertiary(`· ${uptimeStr}`) : ''}`
  );
  output.blank();
  output.printBox(colors.brand.info(colors.underline(dashboardUrl)), {
    title: 'Dashboard',
    style: 'branded',
  });

  if (globalOptions.verbose && pid) {
    output.blank();
    output.print(`  ${colors.brand.textTertiary('PID:')} ${pid}`);
  }

  if (globalOptions.verbose && serverInfo?.logFile) {
    output.print(
      `  ${colors.brand.textTertiary('Log:')} ${serverInfo.logFile}`
    );
  }
}

export async function tddStatusCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let { pidFile } = getLocalDaemonFiles();
  let target = resolveDaemonTarget(options);

  if (!target.serverInfo && !existsSync(pidFile)) {
    // JSON output for not running
    if (globalOptions.json) {
      output.data({
        running: false,
        message: 'TDD server not running',
      });
      return;
    }
    output.info('TDD server not running');
    return;
  }

  try {
    let pid = target.useLocalPidFile ? readDaemonPidFile(pidFile) : null;
    if (!pid) {
      pid = target.serverInfo?.pid || null;
    }
    if (!pid) {
      output.warn('TDD server not running (cleaning up stale files)');
      cleanupDaemonTarget(target);
      return;
    }

    // Check if process is actually running
    process.kill(pid, 0); // Signal 0 just checks if process exists

    // Try to check health endpoint
    let health = await checkServerHealth(target.port);

    if (health.running) {
      // Calculate uptime
      let uptimeMs = null;
      let uptimeStr = '';
      if (target.serverInfo?.startTime) {
        uptimeMs = Date.now() - target.serverInfo.startTime;
        let uptime = Math.floor(uptimeMs / 1000);
        let hours = Math.floor(uptime / 3600);
        let minutes = Math.floor((uptime % 3600) / 60);
        let seconds = uptime % 60;
        if (hours > 0) uptimeStr += `${hours}h `;
        if (minutes > 0 || hours > 0) uptimeStr += `${minutes}m `;
        uptimeStr += `${seconds}s`;
      }

      let dashboardUrl = buildDashboardUrl(target.port);

      printRunningStatus({
        serverInfo: target.serverInfo,
        port: target.port,
        pid,
        uptimeMs,
        uptimeStr,
        dashboardUrl,
        globalOptions,
      });
    } else {
      output.warn(
        'TDD server process exists but not responding to health checks'
      );
    }
  } catch (error) {
    if (error.code === 'ESRCH') {
      cleanupDaemonTarget(target);
      if (globalOptions.json) {
        output.data({
          status: 'stale',
          running: false,
          message: 'TDD server process not found; cleaned up stale files',
        });
        return;
      }
      output.warn('TDD server process not found (cleaning up stale files)');
    } else {
      output.error('Error checking TDD server status', error);
    }
  }
}

/**
 * Check if server is running on given port
 * @private
 */
async function isServerRunning(port = 47392) {
  try {
    let health = await checkServerHealth(port);
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
    let response = await fetch(`http://localhost:${port}/health`);
    let data = await response.json();
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
  let url = buildDashboardUrl(port);
  let { command, args } = buildOpenDashboardCommand(url);

  spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

/**
 * List all running TDD servers from the global registry
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function tddListCommand(_options, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let registry = getServerRegistry();

  // Clean up stale servers first
  let cleaned = registry.cleanupStale();
  if (cleaned > 0 && globalOptions.verbose) {
    output.debug('tdd', `Cleaned up ${cleaned} stale server(s)`);
  }

  let servers = registry.list();

  // JSON output
  if (globalOptions.json) {
    output.data({ servers });
    return;
  }

  // No servers
  if (servers.length === 0) {
    output.info('No TDD servers running');
    output.hint('Start one with: vizzly tdd start');
    return;
  }

  // Table output
  let colors = output.getColors();

  output.header('tdd', 'servers');
  output.blank();

  for (let server of servers) {
    let uptimeStr = '';
    if (server.startedAt) {
      let startTime = new Date(server.startedAt).getTime();
      let uptime = Math.floor((Date.now() - startTime) / 1000);
      let hours = Math.floor(uptime / 3600);
      let minutes = Math.floor((uptime % 3600) / 60);
      if (hours > 0) uptimeStr += `${hours}h `;
      if (minutes > 0 || hours > 0) uptimeStr += `${minutes}m`;
      else uptimeStr = '<1m';
    }

    let name = server.name || basename(server.directory);
    let portStr = colors.brand.textTertiary(`:${server.port}`);
    let uptimeLabel = uptimeStr
      ? colors.brand.textMuted(` · ${uptimeStr}`)
      : '';

    output.print(
      `  ${output.statusDot('success')} ${name}${portStr}${uptimeLabel}`
    );
    output.print(`    ${colors.brand.textMuted(server.directory)}`);

    if (globalOptions.verbose) {
      output.print(`    ${colors.brand.textMuted(`PID: ${server.pid}`)}`);
    }

    output.blank();
  }

  output.print(
    `  ${colors.brand.textTertiary(`${servers.length} server(s) running`)}`
  );
}
