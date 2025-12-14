/**
 * Test Runner Operations - Test execution operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - spawn: child_process.spawn for executing commands
 * - serverManager: for starting/stopping screenshot server
 * - buildManager: for local build management (TDD mode)
 * - apiClient: for API builds and finalization
 * - output: for logging
 *
 * This makes them trivially testable without mocking modules.
 */

import {
  buildApiBuildPayload,
  buildClientOptions,
  buildDisabledEnv,
  buildDisabledRunResult,
  buildRunResult,
  buildSpawnOptions,
  buildTestEnv,
  hasApiKey,
  normalizeSetBaseline,
  shouldDisableVizzly,
  validateDaemonMode,
  validateTestCommand,
} from './core.js';

// ============================================================================
// Build Operations
// ============================================================================

/**
 * Create a build (either locally for TDD or via API)
 * @param {Object} options - Options
 * @param {Object} options.runOptions - Run options (buildName, branch, etc.)
 * @param {boolean} options.tdd - Whether in TDD mode
 * @param {Object} options.config - Configuration object
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.buildManager - Build manager for local builds
 * @param {Function} options.deps.createApiClient - API client factory
 * @param {Function} options.deps.createApiBuild - API build creation function
 * @param {Object} options.deps.output - Output utilities
 * @returns {Promise<string>} Build ID
 */
export async function createBuild({ runOptions, tdd, config, deps }) {
  let { buildManager, createApiClient, createApiBuild, output } = deps;

  if (tdd) {
    // TDD mode: create local build
    let build = await buildManager.createBuild(runOptions);
    output.debug('build', `created ${build.id.substring(0, 8)}`);
    return build.id;
  }

  // API mode: create build via API
  let clientOptions = buildClientOptions(config);
  if (!clientOptions) {
    throw new Error('No API key available for build creation');
  }

  let client = createApiClient(clientOptions);
  let payload = buildApiBuildPayload(runOptions, config.comparison);
  let buildResult = await createApiBuild(client, payload);

  output.debug('build', `created ${buildResult.id}`);

  return buildResult.id;
}

/**
 * Get build URL from API
 * @param {Object} options - Options
 * @param {string} options.buildId - Build ID
 * @param {Object} options.config - Configuration object
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.createApiClient - API client factory
 * @param {Function} options.deps.getBuild - Get build function
 * @param {Object} options.deps.output - Output utilities
 * @returns {Promise<string|null>} Build URL or null
 */
export async function fetchBuildUrl({ buildId, config, deps }) {
  let { createApiClient, getBuild, output } = deps;

  let clientOptions = buildClientOptions(config);
  if (!clientOptions) {
    return null;
  }

  try {
    let client = createApiClient(clientOptions);
    let build = await getBuild(client, buildId);
    return build.url || null;
  } catch (error) {
    output.debug('build', 'could not retrieve url', { error: error.message });
    return null;
  }
}

/**
 * Finalize a build
 * @param {Object} options - Options
 * @param {string} options.buildId - Build ID
 * @param {boolean} options.tdd - Whether in TDD mode
 * @param {boolean} options.success - Whether tests passed
 * @param {number} options.executionTime - Execution time in ms
 * @param {Object} options.config - Configuration object
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.serverManager - Server manager
 * @param {Function} options.deps.createApiClient - API client factory
 * @param {Function} options.deps.finalizeApiBuild - API finalize function
 * @param {Object} options.deps.output - Output utilities
 * @param {Function} [options.deps.onFinalizeFailed] - Callback for finalize failure
 */
export async function finalizeBuild({
  buildId,
  tdd,
  success,
  executionTime,
  config,
  deps,
}) {
  let {
    serverManager,
    createApiClient,
    finalizeApiBuild,
    output,
    onFinalizeFailed,
  } = deps;

  if (!buildId) {
    return;
  }

  try {
    if (tdd) {
      // TDD mode: use server handler to finalize (local-only)
      if (serverManager.server?.finishBuild) {
        await serverManager.server.finishBuild(buildId);
        output.debug('build', 'finalized', { success });
      }
    } else {
      // API mode: flush uploads first, then finalize build
      if (serverManager.server?.finishBuild) {
        await serverManager.server.finishBuild(buildId);
      }

      // Then update build status via API
      let clientOptions = buildClientOptions(config);
      if (clientOptions) {
        let client = createApiClient(clientOptions);
        await finalizeApiBuild(client, buildId, success, executionTime);
        output.debug('build', 'finalized via api', { success });
      } else {
        output.warn(`No API service available to finalize build ${buildId}`);
      }
    }
  } catch (error) {
    // Don't fail the entire run if build finalization fails
    output.warn(`Failed to finalize build ${buildId}:`, error.message);
    if (onFinalizeFailed) {
      onFinalizeFailed({ buildId, error: error.message, stack: error.stack });
    }
  }
}

// ============================================================================
// Test Execution Operations
// ============================================================================

/**
 * Execute a test command
 * @param {Object} options - Options
 * @param {string} options.command - Test command to execute
 * @param {Object} options.env - Environment variables
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.spawn - Spawn function
 * @param {Function} options.deps.createError - Error factory
 * @returns {Promise<{ process: Object }>} Spawned process reference
 */
export function executeTestCommand({ command, env, deps }) {
  let { spawn, createError } = deps;

  return new Promise((resolve, reject) => {
    let spawnOptions = buildSpawnOptions(env);
    let testProcess = spawn(command, spawnOptions);

    testProcess.on('error', error => {
      reject(
        createError(
          `Failed to run test command: ${error.message}`,
          'TEST_COMMAND_FAILED'
        )
      );
    });

    testProcess.on('exit', (code, signal) => {
      if (signal === 'SIGINT') {
        reject(
          createError(
            'Test command was interrupted',
            'TEST_COMMAND_INTERRUPTED'
          )
        );
      } else if (code !== 0) {
        reject(
          createError(
            `Test command exited with code ${code}`,
            'TEST_COMMAND_FAILED'
          )
        );
      } else {
        resolve({ process: testProcess });
      }
    });

    // Return process reference for cancellation
    resolve.__process = testProcess;
  });
}

// ============================================================================
// High-Level Run Operations
// ============================================================================

/**
 * Run tests with Vizzly integration
 * @param {Object} options - Options
 * @param {Object} options.runOptions - Run options (testCommand, tdd, etc.)
 * @param {Object} options.config - Configuration object
 * @param {Object} options.deps - Dependencies
 * @returns {Promise<Object>} Run result
 */
export async function runTests({ runOptions, config, deps }) {
  let {
    serverManager,
    buildManager,
    spawn,
    createApiClient,
    createApiBuild,
    getBuild,
    finalizeApiBuild,
    createError,
    output,
    onBuildCreated,
    onServerReady,
    onFinalizeFailed,
  } = deps;

  let { testCommand, tdd, allowNoToken } = runOptions;
  let startTime = Date.now();

  // Validate test command
  let validation = validateTestCommand(testCommand);
  if (!validation.valid) {
    throw createError(validation.error, 'TEST_COMMAND_MISSING');
  }

  // Check if we should skip Vizzly integration entirely
  if (
    shouldDisableVizzly({ allowNoToken, hasApiKey: hasApiKey(config), tdd })
  ) {
    let env = buildDisabledEnv();
    await executeTestCommand({
      command: testCommand,
      env,
      deps: { spawn, createError },
    });
    return buildDisabledRunResult();
  }

  let buildId = null;
  let buildUrl = null;
  let screenshotCount = 0;
  let testSuccess = false;
  let testError = null;

  try {
    // Create build
    buildId = await createBuild({
      runOptions,
      tdd,
      config,
      deps: { buildManager, createApiClient, createApiBuild, output },
    });

    // Get build URL for API mode
    if (!tdd && buildId) {
      buildUrl = await fetchBuildUrl({
        buildId,
        config,
        deps: { createApiClient, getBuild, output },
      });
      if (buildUrl) {
        output.info(`Build URL: ${buildUrl}`);
      }

      if (onBuildCreated) {
        onBuildCreated({ buildId, url: buildUrl });
      }
    }

    // Start server
    let setBaseline = normalizeSetBaseline(runOptions);
    await serverManager.start(buildId, tdd, setBaseline);

    if (onServerReady) {
      onServerReady({ port: config.server?.port, buildId, tdd });
    }

    // Execute test command
    let env = buildTestEnv({
      port: config.server?.port,
      buildId,
      setBaseline,
    });

    try {
      await executeTestCommand({
        command: testCommand,
        env,
        deps: { spawn, createError },
      });
      testSuccess = true;
    } catch (error) {
      testError = error;
      testSuccess = false;
    }
  } catch (error) {
    testError = error;
    testSuccess = false;
  }

  // Get TDD results before stopping the server
  let tddResults = null;
  if (tdd) {
    try {
      tddResults = await serverManager.getTddResults?.();
      if (tddResults) {
        screenshotCount = tddResults.total || 0;
      }
    } catch (tddError) {
      output.debug('tdd', 'failed to get results', { error: tddError.message });
    }
  }

  // Always finalize and cleanup
  try {
    let executionTime = Date.now() - startTime;

    if (buildId) {
      try {
        await finalizeBuild({
          buildId,
          tdd,
          success: testSuccess,
          executionTime,
          config,
          deps: {
            serverManager,
            createApiClient,
            finalizeApiBuild,
            output,
            onFinalizeFailed,
          },
        });
      } catch (finalizeError) {
        output.error('Failed to finalize build:', finalizeError);
      }
    }

    // In API mode, get actual screenshot count from handler after flush
    if (!tdd && serverManager.server?.getScreenshotCount) {
      screenshotCount = serverManager.server.getScreenshotCount(buildId) || 0;
    }
  } finally {
    try {
      await serverManager.stop();
    } catch (stopError) {
      output.error('Failed to stop server:', stopError);
    }
  }

  // Throw test error after cleanup
  if (testError) {
    output.error('Test run failed:', testError);
    throw testError;
  }

  return buildRunResult({
    buildId,
    buildUrl,
    testSuccess,
    screenshotCount,
    tddResults,
  });
}

/**
 * Initialize daemon server (TDD mode only)
 * @param {Object} options - Options
 * @param {Object} options.initOptions - Init options
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.serverManager - Server manager
 * @param {Function} options.deps.createError - Error factory
 * @param {Object} options.deps.output - Output utilities
 * @param {Function} [options.deps.onServerReady] - Server ready callback
 */
export async function initializeDaemon({ initOptions, deps }) {
  let { serverManager, createError, output, onServerReady } = deps;

  let validation = validateDaemonMode(initOptions);
  if (!validation.valid) {
    throw createError(validation.error, 'INVALID_MODE');
  }

  try {
    let setBaseline = normalizeSetBaseline(initOptions);
    await serverManager.start(null, true, setBaseline);

    if (onServerReady) {
      onServerReady({
        port: initOptions.port,
        mode: 'daemon',
        tdd: true,
      });
    }
  } catch (error) {
    output.error('Failed to initialize TDD daemon server:', error);
    throw error;
  }
}

/**
 * Cancel running tests
 * @param {Object} options - Options
 * @param {Object|null} options.testProcess - Running test process
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.serverManager - Server manager
 */
export async function cancelTests({ testProcess, deps }) {
  let { serverManager } = deps;

  if (testProcess && !testProcess.killed) {
    testProcess.kill('SIGKILL');
  }

  if (serverManager) {
    await serverManager.stop();
  }
}
