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
import { createStateStore } from '../tdd/state-store.js';

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
    let globalConfigPath = join(
      process.env.VIZZLY_HOME || join(homedir(), '.vizzly'),
      'config.json'
    );

    // Load global config once
    let globalConfig = {};
    try {
      if (existsSync(globalConfigPath)) {
        globalConfig = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
      }
    } catch {
      // Ignore
    }

    // Check for vizzly.config.js (project config)
    let hasProjectConfig = existsSync(join(cwd, 'vizzly.config.js'));

    // Check for .vizzly directory (TDD baselines)
    let baselineCount = 0;
    try {
      let stateDbPath = join(cwd, '.vizzly', 'state.db');
      let legacyBaselinePath = join(
        cwd,
        '.vizzly',
        'baselines',
        'metadata.json'
      );

      if (existsSync(stateDbPath) || existsSync(legacyBaselinePath)) {
        let stateStore = createStateStore({ workingDir: cwd });
        try {
          let metadata = stateStore.getBaselineMetadata();
          baselineCount = metadata?.screenshots?.length || 0;
        } finally {
          stateStore.close();
        }
      }
    } catch {
      // Ignore
    }

    // Check for TDD server running
    let serverRunning = false;
    let serverPort = null;
    try {
      let serverFile = join(cwd, '.vizzly', 'server.json');
      if (existsSync(serverFile)) {
        let serverInfo = JSON.parse(readFileSync(serverFile, 'utf8'));
        serverPort = serverInfo.port;
        serverRunning = true;
      }
    } catch {
      // Ignore
    }

    // Check for OAuth login (from vizzly login)
    let isLoggedIn = !!globalConfig.auth?.accessToken;
    let userName =
      globalConfig.auth?.user?.name || globalConfig.auth?.user?.email;

    // Check for env token
    let hasEnvToken = !!process.env.VIZZLY_TOKEN;

    // Build context items - prioritize most useful info
    if (serverRunning) {
      items.push({
        type: 'success',
        label: 'TDD Server',
        value: `running on :${serverPort}`,
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

    if (baselineCount > 0) {
      items.push({
        type: 'success',
        label: 'Baselines',
        value: `${baselineCount} screenshots`,
      });
    }

    if (!hasProjectConfig && !serverRunning && baselineCount === 0) {
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
  let globalConfigPath = join(
    process.env.VIZZLY_HOME || join(homedir(), '.vizzly'),
    'config.json'
  );

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
    // Load global config
    let globalConfig = {};
    try {
      if (existsSync(globalConfigPath)) {
        globalConfig = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
      }
    } catch {
      // Ignore
    }

    // Check for vizzly.config.js
    context.project.hasConfig = existsSync(join(cwd, 'vizzly.config.js'));

    // Check for baselines
    try {
      let stateDbPath = join(cwd, '.vizzly', 'state.db');
      let legacyBaselinePath = join(
        cwd,
        '.vizzly',
        'baselines',
        'metadata.json'
      );

      if (existsSync(stateDbPath) || existsSync(legacyBaselinePath)) {
        let stateStore = createStateStore({ workingDir: cwd });
        try {
          let metadata = stateStore.getBaselineMetadata();
          context.baselines.count = metadata?.screenshots?.length || 0;
          if (metadata) {
            context.baselines.path = join(cwd, '.vizzly', 'baselines');
          }
        } finally {
          stateStore.close();
        }
      }
    } catch {
      // Ignore
    }

    // Check for TDD server
    try {
      let serverFile = join(cwd, '.vizzly', 'server.json');
      if (existsSync(serverFile)) {
        let serverInfo = JSON.parse(readFileSync(serverFile, 'utf8'));
        context.tddServer.running = true;
        context.tddServer.port = serverInfo.port;
      }
    } catch {
      // Ignore
    }

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
