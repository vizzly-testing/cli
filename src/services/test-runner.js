/**
 * Test Runner Service
 * Orchestrates the test execution flow
 *
 * This EventEmitter adapter keeps the stable plugin-facing runner contract
 * while delegating execution to the functional operations in src/test-runner/.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  createBuild as createApiBuild,
  createApiClient,
  finalizeBuild as finalizeApiBuild,
  getBuild,
} from '../api/index.js';
import { VizzlyError } from '../errors/vizzly-error.js';
import {
  cancelTests,
  createBuild,
  finalizeBuild,
  initializeDaemon,
  runTests,
} from '../test-runner/index.js';
import * as output from '../utils/output.js';
import { writeSession as defaultWriteSession } from '../utils/session.js';
import { createBuildObject } from './build-manager.js';

export class TestRunner extends EventEmitter {
  constructor(config, serverManager, options = {}) {
    super();
    this.config = config;
    this.serverManager = serverManager;
    this.testProcess = null;

    // Simple buildManager using pure function
    this.buildManager = {
      createBuild: buildOptions => createBuildObject(buildOptions),
    };

    // Dependency injection for testing - defaults to real implementations
    this.deps = options.deps || {
      spawn,
      createApiClient,
      createApiBuild,
      getBuild,
      finalizeApiBuild,
      output,
      writeSession: defaultWriteSession,
      createError: (message, code) => new VizzlyError(message, code),
    };
  }

  /**
   * Initialize server for daemon mode (no test execution)
   * @param {Object} options - Options for server initialization
   */
  async initialize(options) {
    await initializeDaemon({
      initOptions: options,
      deps: {
        serverManager: this.serverManager,
        createError: this.deps.createError,
        output: this.deps.output,
        onServerReady: data => this.emit('server-ready', data),
      },
    });
  }

  async run(options) {
    let result = await runTests({
      runOptions: options,
      config: this.config,
      deps: {
        serverManager: this.serverManager,
        buildManager: this.buildManager,
        spawn: (command, spawnOptions) => {
          let proc = this.deps.spawn(command, spawnOptions);
          this.testProcess = proc;
          return proc;
        },
        createApiClient: this.deps.createApiClient,
        createApiBuild: this.deps.createApiBuild,
        getBuild: this.deps.getBuild,
        finalizeApiBuild: this.deps.finalizeApiBuild,
        createError: this.deps.createError,
        output: this.deps.output,
        onBuildCreated: data => this.emit('build-created', data),
        onServerReady: data => this.emit('server-ready', data),
        onFinalizeFailed: data => this.emit('build-finalize-failed', data),
      },
    });

    return result;
  }

  async createBuild(options, tdd) {
    let buildId = await createBuild({
      runOptions: options,
      tdd,
      config: this.config,
      deps: {
        buildManager: this.buildManager,
        createApiClient: this.deps.createApiClient,
        createApiBuild: this.deps.createApiBuild,
        output: this.deps.output,
      },
    });

    if (!tdd && buildId) {
      let writeSession = this.deps.writeSession || defaultWriteSession;
      writeSession({
        buildId,
        branch: options?.branch,
        commit: options?.commit,
        parallelId: options?.parallelId,
      });
    }

    return buildId;
  }

  async finalizeBuild(buildId, isTddMode, success, executionTime) {
    await finalizeBuild({
      buildId,
      tdd: isTddMode,
      success,
      executionTime,
      config: this.config,
      deps: {
        serverManager: this.serverManager,
        createApiClient: this.deps.createApiClient,
        finalizeApiBuild: this.deps.finalizeApiBuild,
        output: this.deps.output,
        onFinalizeFailed: data => this.emit('build-finalize-failed', data),
      },
    });
  }

  async cancel() {
    await cancelTests({
      testProcess: this.testProcess,
      deps: {
        serverManager: this.serverManager,
      },
    });
  }
}
