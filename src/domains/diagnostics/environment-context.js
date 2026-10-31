/**
 * Dynamic context detection for CLI commands
 *
 * Detects the current state of Vizzly in the working directory:
 * - TDD server status
 * - Project configuration
 * - Authentication status
 * - Baseline counts
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getGlobalConfigPath() {
  return join(
    process.env.VIZZLY_HOME || join(homedir(), '.vizzly'),
    'config.json'
  );
}

function readJsonFile(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'));
    }
  } catch {
    // Optional context should never block the command that is rendering it.
  }

  return null;
}

function readGlobalConfig() {
  return readJsonFile(getGlobalConfigPath()) || {};
}

function readBaselineInfo(cwd) {
  let path = join(cwd, '.vizzly', 'baselines');
  let metadata = readJsonFile(join(path, 'metadata.json'));

  return {
    count: metadata?.screenshots?.length || 0,
    path: metadata ? path : null,
  };
}

function readServerInfo(cwd) {
  let serverInfo = readJsonFile(join(cwd, '.vizzly', 'server.json'));

  return {
    running: !!serverInfo,
    port: serverInfo ? serverInfo.port : null,
  };
}

/**
 * Get dynamic context about the current Vizzly state
 * Returns an array of context items with type, label, and value
 *
 * @returns {Array<{type: 'success'|'warning'|'info', label: string, value: string}>}
 */
export function getContext() {
  let items = [];

  try {
    let cwd = process.cwd();
    let globalConfig = readGlobalConfig();

    // Check for vizzly.config.js (project config)
    let hasProjectConfig = existsSync(join(cwd, 'vizzly.config.js'));

    let baselineInfo = readBaselineInfo(cwd);
    let serverInfo = readServerInfo(cwd);

    // Check for OAuth login (from vizzly login)
    let isLoggedIn = !!globalConfig.auth?.accessToken;
    let userName =
      globalConfig.auth?.user?.name || globalConfig.auth?.user?.email;

    // Check for env token
    let hasEnvToken = !!process.env.VIZZLY_TOKEN;

    // Build context items - prioritize most useful info
    if (serverInfo.running) {
      items.push({
        type: 'success',
        label: 'TDD Server',
        value: `running on :${serverInfo.port}`,
      });
    }

    if (isLoggedIn && userName) {
      items.push({ type: 'success', label: 'Logged in', value: userName });
    } else if (hasEnvToken) {
      items.push({
        type: 'success',
        label: 'API Token',
        value: 'via VIZZLY_TOKEN',
      });
    } else {
      items.push({
        type: 'info',
        label: 'Not connected',
        value: 'run vizzly login',
      });
    }

    if (baselineInfo.count > 0) {
      items.push({
        type: 'success',
        label: 'Baselines',
        value: `${baselineInfo.count} screenshots`,
      });
    }

    if (!hasProjectConfig && !serverInfo.running && baselineInfo.count === 0) {
      // Only show "no config" hint if there's nothing else useful
      items.push({
        type: 'info',
        label: 'Get started',
        value: 'run vizzly init',
      });
    }
  } catch {
    // If anything fails, just return empty - context is optional
  }

  return items;
}

/**
 * Get detailed context with raw values (for doctor command)
 * Returns more detailed information suitable for diagnostics
 *
 * @returns {Object} Detailed context object
 */
export function getDetailedContext() {
  let cwd = process.cwd();

  let context = {
    tddServer: {
      running: false,
      port: null,
    },
    project: {
      hasConfig: false,
    },
    auth: {
      loggedIn: false,
      userName: null,
      hasEnvToken: false,
    },
    baselines: {
      count: 0,
      path: null,
    },
  };

  try {
    let globalConfig = readGlobalConfig();

    // Check for vizzly.config.js
    context.project.hasConfig = existsSync(join(cwd, 'vizzly.config.js'));

    let baselineInfo = readBaselineInfo(cwd);
    context.baselines.count = baselineInfo.count;
    context.baselines.path = baselineInfo.path;

    let serverInfo = readServerInfo(cwd);
    context.tddServer.running = serverInfo.running;
    context.tddServer.port = serverInfo.port;

    // Check auth status
    context.auth.loggedIn = !!globalConfig.auth?.accessToken;
    context.auth.userName =
      globalConfig.auth?.user?.name || globalConfig.auth?.user?.email;
    context.auth.hasEnvToken = !!process.env.VIZZLY_TOKEN;
  } catch {
    // If anything fails, return defaults
  }

  return context;
}
