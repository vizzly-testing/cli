/**
 * TDD command implementation
 * Uses functional operations directly - no class wrappers needed
 */

import { spawn as defaultSpawn } from 'node:child_process';
import {
  createBuild as defaultCreateApiBuild,
  createApiClient as defaultCreateApiClient,
  finalizeBuild as defaultFinalizeApiBuild,
  getBuild as defaultGetBuild,
} from '../api/index.js';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createServerManager as defaultCreateServerManager } from '../server-manager/index.js';
import { createAuthService as defaultCreateAuthService } from '../services/auth-service.js';
import { createBuildObject as defaultCreateBuildObject } from '../services/build-manager.js';
import { createConfigService as defaultCreateConfigService } from '../services/config-service.js';
import { createProjectService as defaultCreateProjectService } from '../services/project-service.js';
import {
  initializeDaemon as defaultInitializeDaemon,
  runTests as defaultRunTests,
} from '../test-runner/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import {
  detectBranch as defaultDetectBranch,
  detectCommit as defaultDetectCommit,
} from '../utils/git.js';
import * as defaultOutput from '../utils/output.js';

/**
 * TDD command implementation
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 * @returns {Promise<{result: Object, cleanup: Function}>} Result and cleanup function
 */
export async function tddCommand(
  testCommand,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    createApiBuild = defaultCreateApiBuild,
    finalizeApiBuild = defaultFinalizeApiBuild,
    getBuild = defaultGetBuild,
    createServerManager = defaultCreateServerManager,
    createBuildObject = defaultCreateBuildObject,
    createAuthService = defaultCreateAuthService,
    createConfigService = defaultCreateConfigService,
    createProjectService = defaultCreateProjectService,
    initializeDaemon = defaultInitializeDaemon,
    runTests = defaultRunTests,
    detectBranch = defaultDetectBranch,
    detectCommit = defaultDetectCommit,
    spawn = defaultSpawn,
    output = defaultOutput,
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let serverManager = null;
  let testProcess = null;
  let isCleanedUp = false;

  // Create cleanup function that can be called by the caller
  let cleanup = async () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    output.cleanup();
    if (testProcess && !testProcess.killed) {
      testProcess.kill('SIGKILL');
    }
    if (serverManager) {
      await serverManager.stop();
    }
  };

  try {
    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Dev mode works locally by default - only needs token for baseline download
    let needsToken = options.baselineBuild || options.baselineComparison;

    if (!config.apiKey && needsToken) {
      throw new Error(
        'API token required when using --baseline-build or --baseline-comparison flags'
      );
    }

    // Always allow no-token mode for dev mode unless baseline flags are used
    config.allowNoToken = true;

    // Collect git metadata
    let branch = await detectBranch(options.branch);
    let commit = await detectCommit(options.commit);

    // Show header (skip in daemon mode)
    if (!options.daemon) {
      let mode = config.apiKey ? 'local' : 'local';
      output.header('tdd', mode);

      // Show config in verbose mode
      output.debug(
        'config',
        `port=${config.server.port} threshold=${config.comparison.threshold}`
      );
    }

    // Create functional dependencies
    output.startSpinner('Initializing TDD server...');
    let configWithVerbose = { ...config, verbose: globalOptions.verbose };

    // Create services for dashboard tabs
    let configService = createConfigService({ workingDir: process.cwd() });
    let authService = createAuthService();
    let projectService = createProjectService();

    // Create server manager (functional object)
    serverManager = createServerManager(configWithVerbose, {
      configService,
      authService,
      projectService,
    });

    // Create build manager (functional object that provides the interface runTests expects)
    let buildManager = {
      async createBuild(buildOptions) {
        return createBuildObject(buildOptions);
      },
    };

    output.stopSpinner();

    let runOptions = {
      testCommand,
      port: config.server.port,
      timeout: config.server.timeout,
      tdd: true,
      daemon: options.daemon || false,
      setBaseline: options.setBaseline || false,
      branch,
      commit,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      allowNoToken: config.allowNoToken || false,
      baselineBuildId: config.baselineBuildId,
      baselineComparisonId: config.baselineComparisonId,
      wait: false,
    };

    // In daemon mode, just start the server without running tests
    if (options.daemon) {
      await initializeDaemon({
        initOptions: runOptions,
        deps: {
          serverManager,
          createError: (msg, code) => new VizzlyError(msg, code),
          output,
          onServerReady: data => {
            output.debug('server', `ready on :${data.port}`);
          },
        },
      });

      return {
        result: {
          success: true,
          daemon: true,
          port: config.server.port,
        },
        cleanup,
      };
    }

    // Normal dev mode - run tests
    output.debug('run', testCommand);

    let runResult = await runTests({
      runOptions,
      config: configWithVerbose,
      deps: {
        serverManager,
        buildManager,
        spawn: (command, spawnOptions) => {
          let proc = spawn(command, spawnOptions);
          testProcess = proc;
          return proc;
        },
        createApiClient,
        createApiBuild,
        getBuild,
        finalizeApiBuild,
        createError: (msg, code) => new VizzlyError(msg, code),
        output,
        onBuildCreated: data => {
          output.debug('build', `created ${data.buildId?.substring(0, 8)}`);
        },
        onServerReady: data => {
          output.debug('server', `ready on :${data.port}`);
        },
        onFinalizeFailed: data => {
          output.warn(`Failed to finalize build: ${data.error}`);
        },
      },
    });

    // Determine success based on comparison results
    // (Summary is printed by printResults() in tdd-service.js, called from getTddResults)
    let hasFailures =
      runResult.failed ||
      runResult.comparisons?.some(c => c.status === 'failed');

    return {
      result: {
        success: !hasFailures,
        exitCode: hasFailures ? 1 : 0,
        ...runResult,
      },
      cleanup,
    };
  } catch (error) {
    output.error('Test failed', error);
    return {
      result: {
        success: false,
        exitCode: 1,
        error: error.message,
      },
      cleanup,
    };
  }
}

/**
 * Validate TDD options
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 */
export function validateTddOptions(testCommand, options) {
  let errors = [];

  if (!testCommand || testCommand.trim() === '') {
    errors.push('Test command is required');
  }

  if (options.port) {
    let port = parseInt(options.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push('Port must be a valid number between 1 and 65535');
    }
  }

  if (options.timeout) {
    let timeout = parseInt(options.timeout, 10);
    if (Number.isNaN(timeout) || timeout < 1000) {
      errors.push('Timeout must be at least 1000 milliseconds');
    }
  }

  if (options.threshold !== undefined) {
    let threshold = parseFloat(options.threshold);
    if (Number.isNaN(threshold) || threshold < 0) {
      errors.push(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    }
  }

  return errors;
}
