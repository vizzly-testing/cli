import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let defaultTimers = { setTimeout, clearTimeout };

function wait(ms, timers = defaultTimers) {
  return new Promise(resolve => {
    timers.setTimeout(resolve, ms);
  });
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function parsePositiveInteger(value) {
  let text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }

  let number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function readDaemonPidFile(pidFile, deps = {}) {
  let fileExists = deps.existsSync || existsSync;
  let readFile = deps.readFileSync || readFileSync;

  if (!fileExists(pidFile)) {
    return null;
  }

  try {
    return parsePositiveInteger(readFile(pidFile, 'utf8'));
  } catch {
    return null;
  }
}

export async function findDaemonPidByPort(port, { spawnProcess = spawn } = {}) {
  try {
    let lsofProcess = spawnProcess('lsof', ['-ti', `:${port}`], {
      stdio: 'pipe',
    });

    let lsofOutput = '';
    lsofProcess.stdout.on('data', data => {
      lsofOutput += data.toString();
    });

    return await new Promise(resolve => {
      lsofProcess.on('close', code => {
        if (code === 0 && lsofOutput.trim()) {
          let foundPid = parsePositiveInteger(lsofOutput.trim().split('\n')[0]);
          resolve(foundPid);
          return;
        }

        resolve(null);
      });

      lsofProcess.on('error', () => {
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

export async function resolveDaemonPid({
  port,
  pidFile = join(process.cwd(), '.vizzly', 'server.pid'),
  readPid = readDaemonPidFile,
  findByPort = findDaemonPidByPort,
  allowPortFallback = false,
  fileDeps = {},
} = {}) {
  let pid = readPid(pidFile, fileDeps);
  if (pid) {
    return pid;
  }

  if (!allowPortFallback) {
    return null;
  }

  return await findByPort(port);
}

export async function waitForProcessExit(
  pid,
  {
    timeoutMs = 2000,
    intervalMs = 100,
    processRunning = isProcessRunning,
    timers = defaultTimers,
  } = {}
) {
  let elapsedMs = 0;

  while (elapsedMs < timeoutMs) {
    if (!processRunning(pid)) {
      return true;
    }

    let nextDelay = Math.min(intervalMs, timeoutMs - elapsedMs);
    await wait(nextDelay, timers);
    elapsedMs += nextDelay;
  }

  return !processRunning(pid);
}
