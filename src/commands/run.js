/**
 * Run command implementation
 * Uses functional operations directly - no class wrappers needed
 */

import { spawn as defaultSpawn } from 'node:child_process';
import {
  createBuild as defaultCreateApiBuild,
  createApiClient as defaultCreateApiClient,
  finalizeBuild as defaultFinalizeApiBuild,
  getBuild as defaultGetBuild,
  getTokenContext as defaultGetTokenContext,
} from '../api/index.js';
import { CONFIG_DEFAULTS } from '../config/core.js';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createServerManager as defaultCreateServerManager } from '../server-manager/index.js';
import { createBuildObject as defaultCreateBuildObject } from '../services/build-manager.js';
import {
  finalizeBuild as defaultFinalizeBuild,
  runTests as defaultRunTests,
} from '../test-runner/index.js';
import { createUploader as defaultCreateUploader } from '../uploader/index.js';
import { getAppBaseUrl } from '../utils/api-url.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import {
  detectBranch as defaultDetectBranch,
  detectCommit as defaultDetectCommit,
  detectCommitMessage as defaultDetectCommitMessage,
  detectPullRequestNumber as defaultDetectPullRequestNumber,
  generateBuildNameWithGit as defaultGenerateBuildNameWithGit,
} from '../utils/git.js';
import * as defaultOutput from '../utils/output.js';
import { writeSession as defaultWriteSession } from '../utils/session.js';

export async function resolveBuildDisplayUrl({
  result,
  config,
  createApiClient = defaultCreateApiClient,
  getTokenContext = defaultGetTokenContext,
}) {
  if (result.url) {
    return result.url;
  }

  if (!config.apiKey) {
    return undefined;
  }

  let baseUrl = getAppBaseUrl(config.apiUrl);

  try {
    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'run',
    });
    let tokenContext = await getTokenContext(client);
    if (tokenContext.organization?.slug && tokenContext.project?.slug) {
      return `${baseUrl}/${tokenContext.organization.slug}/${tokenContext.project.slug}/builds/${result.buildId}`;
    }
  } catch {
    return `${baseUrl}/builds/${result.buildId}`;
  }

  return undefined;
}

/**
 * Build the follow-up command for a cloud run.
 *
 * JSON consumers need a self-contained command that returns structured
 * evidence when executed. Human output keeps the existing readable summary.
 *
 * @param {string} buildId - Cloud build ID to inspect.
 * @param {Object} options - Command output options.
 * @param {boolean} [options.structured=false] - Include machine-readable JSON.
 * @returns {string} Executable build context command.
 */
function buildContextCommand(buildId, { structured = false } = {}) {
  let jsonFlag = structured ? ' --json' : '';
  return `vizzly context build ${buildId} --agent${jsonFlag} --source cloud`;
}

/**
 * Run command implementation
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function runCommand(
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
    getTokenContext = defaultGetTokenContext,
    createServerManager = defaultCreateServerManager,
    createBuildObject = defaultCreateBuildObject,
    createUploader = defaultCreateUploader,
    finalizeBuild = defaultFinalizeBuild,
    runTests = defaultRunTests,
    detectBranch = defaultDetectBranch,
    detectCommit = defaultDetectCommit,
    detectCommitMessage = defaultDetectCommitMessage,
    detectPullRequestNumber = defaultDetectPullRequestNumber,
    generateBuildNameWithGit = defaultGenerateBuildNameWithGit,
    spawn = defaultSpawn,
    output = defaultOutput,
    writeSession = defaultWriteSession,
    exit = code => process.exit(code),
    processOn = (event, handler) => process.on(event, handler),
    processRemoveListener = (event, handler) =>
      process.removeListener(event, handler),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let serverManager = null;
  let testProcess = null;
  let buildId = null;
  let startTime = null;
  let isTddMode = false;
  let config = null;
  let result = null;

  // Ensure cleanup on exit
  let cleanup = async () => {
    output.cleanup();

    // Kill test process if running
    if (testProcess && !testProcess.killed) {
      testProcess.kill('SIGKILL');
    }

    // Stop server
    if (serverManager) {
      try {
        await serverManager.stop();
      } catch {
        // Silent fail
      }
    }

    // Finalize build if we have one
    if (buildId && config) {
      try {
        let executionTime = Date.now() - (startTime || Date.now());
        await finalizeBuild({
          buildId,
          tdd: isTddMode,
          success: false,
          executionTime,
          config,
          deps: {
            serverManager,
            createApiClient,
            finalizeApiBuild,
            output,
          },
        });
      } catch {
        // Silent fail on cleanup
      }
    }
  };

  let sigintHandler = async () => {
    await cleanup();
    exit(1);
  };

  let exitHandler = () => output.cleanup();

  processOn('SIGINT', sigintHandler);
  processOn('exit', exitHandler);

  try {
    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };

    output.debug('[RUN] Loading config', {
      hasToken: !!allOptions.token,
    });

    config = await loadConfig(globalOptions.config, allOptions);

    output.debug('[RUN] Config loaded', {
      hasApiKey: !!config.apiKey,
      apiKeyPrefix: config.apiKey
        ? `${config.apiKey.substring(0, 8)}***`
        : 'NONE',
    });

    if (globalOptions.verbose) {
      output.info('Token check:');
      output.debug('Token details', {
        hasApiKey: !!config.apiKey,
        apiKeyType: typeof config.apiKey,
        apiKeyPrefix:
          typeof config.apiKey === 'string' && config.apiKey
            ? `${config.apiKey.substring(0, 10)}...`
            : 'none',
        projectSlug: config.projectSlug || 'none',
        organizationSlug: config.organizationSlug || 'none',
      });
    }

    // Validate API token (unless --allow-no-token is set)
    if (!config.apiKey && !config.allowNoToken) {
      output.error(
        'API token required. Use --token, set VIZZLY_TOKEN environment variable, or use --allow-no-token to run without uploading'
      );
      exit(1);
      return { success: false, reason: 'no-api-key' };
    }

    // Collect git metadata and build info
    let configuredBuildName =
      config.build.name && config.build.name !== CONFIG_DEFAULTS.build.name
        ? config.build.name
        : undefined;
    let branch = await detectBranch(options.branch || config.build.branch);
    let commit = await detectCommit(options.commit || config.build.commit);
    let message =
      options.message || config.build.message || (await detectCommitMessage());
    let buildName = await generateBuildNameWithGit(
      options.buildName || configuredBuildName
    );
    let pullRequestNumber = detectPullRequestNumber();

    if (globalOptions.verbose) {
      output.info('Configuration loaded');
      output.debug('Config details', {
        testCommand,
        port: config.server.port,
        timeout: config.server.timeout,
        branch,
        commit: commit?.substring(0, 7),
        message,
        buildName,
        environment: config.build.environment,
        allowNoToken: config.allowNoToken || false,
      });
    }

    // Create functional dependencies
    output.startSpinner('Initializing test runner...');
    let configWithVerbose = {
      ...config,
      verbose: globalOptions.verbose,
      uploadAll: options.uploadAll || false,
    };

    output.debug('[RUN] Creating services', {
      hasApiKey: !!configWithVerbose.apiKey,
    });

    // Create server manager (functional object)
    // Note: Unlike TDD mode, run command doesn't need authService/projectService
    // because it has no interactive dashboard - it's a one-shot CI command
    serverManager = createServerManager(configWithVerbose, {});

    // Create build manager (functional object)
    let buildManager = {
      async createBuild(buildOptions) {
        return createBuildObject(buildOptions);
      },
    };

    // Create uploader for --wait functionality
    let uploader = createUploader({ ...configWithVerbose, command: 'run' });

    output.stopSpinner();

    // Track build URL for display
    let buildUrl = null;

    // Prepare run options
    let runOptions = {
      testCommand,
      port: config.server.port,
      timeout: config.server.timeout,
      buildName,
      branch,
      commit,
      message,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      minClusterSize: config.comparison.minClusterSize,
      eager: config.eager || false,
      allowNoToken: config.allowNoToken || false,
      wait: config.wait || options.wait || false,
      uploadAll: options.uploadAll || false,
      pullRequestNumber,
      parallelId: config.parallelId,
      json: globalOptions.json,
    };

    // Start test run
    output.info('Starting test execution...');
    startTime = Date.now();
    isTddMode = runOptions.tdd || false;

    try {
      result = await runTests({
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
            buildUrl = data.url;
            buildId = data.buildId;

            // Write session for subsequent commands (like preview)
            writeSession({
              buildId: data.buildId,
              branch,
              commit,
              parallelId: runOptions.parallelId,
            });

            if (globalOptions.verbose) {
              output.info(`Build created: ${data.buildId}`);
            }
            if (buildUrl) {
              output.info(`Vizzly: ${buildUrl}`);
            }
          },
          onServerReady: data => {
            if (globalOptions.verbose) {
              output.info(`Screenshot server running on port ${data.port}`);
            }
          },
          onFinalizeFailed: data => {
            output.warn(
              `Failed to finalize build ${data.buildId}: ${data.error}`
            );
          },
        },
      });

      // Store buildId for cleanup purposes
      if (result.buildId) {
        buildId = result.buildId;
      }

      // JSON output mode - output structured data and exit
      if (globalOptions.json && !runOptions.wait) {
        let executionTimeMs = Date.now() - startTime;
        let displayUrl = await resolveBuildDisplayUrl({
          result,
          config,
          createApiClient,
          getTokenContext,
        });

        let jsonResult = {
          buildId: result.buildId,
          status: 'completed',
          url: displayUrl,
          screenshotsCaptured: result.screenshotsCaptured || 0,
          executionTimeMs,
          git: {
            branch,
            commit,
            message,
          },
          contextCommand: result.buildId
            ? buildContextCommand(result.buildId, { structured: true })
            : null,
          exitCode: 0,
        };

        output.data(jsonResult);
        output.cleanup();
        return { success: true, result };
      }

      if (!globalOptions.json) {
        output.complete('Test run completed');
      }

      // Show Vizzly summary with link to results
      if (result.buildId && !globalOptions.json) {
        output.blank();
        let colors = output.getColors();
        output.print(
          `  ${colors.brand.textTertiary('Screenshots')}  ${colors.white(result.screenshotsCaptured)}`
        );

        let displayUrl = await resolveBuildDisplayUrl({
          result,
          config,
          createApiClient,
          getTokenContext,
        });

        if (displayUrl) {
          output.print(
            `  ${colors.brand.textTertiary('Results')}      ${colors.info(colors.underline(displayUrl))}`
          );
        } else {
          output.print(
            `  ${colors.brand.textTertiary('Build')}        ${colors.dim(result.buildId)}`
          );
        }

        output.print(
          `  ${colors.brand.textTertiary('Context')}     ${colors.dim(buildContextCommand(result.buildId))}`
        );
      }
    } catch (error) {
      // Test execution failed - build should already be finalized by test runner
      output.stopSpinner();

      // Check if it's a test command failure (as opposed to setup failure)
      if (
        error.code === 'TEST_COMMAND_FAILED' ||
        error.code === 'TEST_COMMAND_INTERRUPTED'
      ) {
        // Extract exit code from error message if available
        let exitCodeMatch = error.message.match(/exited with code (\d+)/);
        let exitCode = exitCodeMatch ? Number(exitCodeMatch[1]) : 1;

        // JSON output for test command failure
        if (globalOptions.json) {
          let executionTimeMs = Date.now() - startTime;
          output.data({
            buildId: buildId || null,
            status: 'failed',
            error: {
              code: error.code,
              message: error.message,
            },
            executionTimeMs,
            git: { branch, commit, message },
            exitCode,
          });
          output.cleanup();
        } else {
          output.error('Test run failed', error);
        }
        return { success: false, exitCode };
      } else {
        // This should only be reached for failures outside the SDK paths that
        // runTests handles by disabling Vizzly and running the child command.
        if (globalOptions.json) {
          let executionTimeMs = Date.now() - (startTime || Date.now());
          output.data({
            buildId: buildId || null,
            status: 'failed',
            error: {
              code: error.code || 'UNKNOWN_ERROR',
              message: error.getUserMessage
                ? error.getUserMessage()
                : error.message,
            },
            executionTimeMs,
            git: { branch, commit, message },
            exitCode: 1,
          });
          output.cleanup();
        } else {
          output.error('Test run failed', error);
        }
        return { success: false, exitCode: 1 };
      }
    }

    // Output results
    if (result.buildId) {
      // Wait for build completion if requested
      if (runOptions.wait) {
        output.info('Waiting for build completion...');
        output.startSpinner('Processing comparisons...');

        let buildResult = await uploader.waitForBuild(result.buildId);

        // JSON output for --wait mode
        if (globalOptions.json) {
          let executionTimeMs = Date.now() - startTime;
          let displayUrl = await resolveBuildDisplayUrl({
            result,
            config,
            createApiClient,
            getTokenContext,
          });

          let exitCode = buildResult.failedComparisons > 0 ? 1 : 0;
          let jsonResult = {
            buildId: result.buildId,
            status: buildResult.failedComparisons > 0 ? 'failed' : 'completed',
            url: displayUrl,
            screenshotsCaptured: result.screenshotsCaptured || 0,
            executionTimeMs,
            git: {
              branch,
              commit,
              message,
            },
            comparisons: {
              total: buildResult.totalComparisons || 0,
              new: buildResult.newComparisons || 0,
              changed: buildResult.failedComparisons || 0,
              identical: buildResult.identicalComparisons || 0,
            },
            approvalStatus: buildResult.approvalStatus || 'pending',
            contextCommand: buildContextCommand(result.buildId, {
              structured: true,
            }),
            exitCode,
          };

          output.data(jsonResult);
          output.cleanup();
          return { success: exitCode === 0, exitCode, result: jsonResult };
        }

        output.success('Build processing completed');

        // Exit with appropriate code based on comparison results
        if (buildResult.failedComparisons > 0) {
          output.error(
            `${buildResult.failedComparisons} visual comparisons failed`
          );
          return { success: false, exitCode: 1 };
        }
      }
    }

    output.cleanup();
    return { success: true, result };
  } catch (error) {
    output.stopSpinner();

    // Once the user's tests have passed, no Vizzly-side error can change the
    // result. This includes polling, formatting, and API response errors.
    if (result) {
      if (globalOptions.json) {
        output.data({
          buildId: result.buildId || null,
          status: 'completed',
          message: 'Vizzly disabled after an SDK error',
          executionTimeMs: Date.now() - (startTime || Date.now()),
          exitCode: 0,
        });
      } else {
        output.warn(
          'Vizzly encountered an error after your tests passed. Ignoring it.'
        );
      }
      output.cleanup();
      output.debug('run', 'Vizzly SDK error details', { error: error.message });
      return { success: true, result };
    }

    // Provide more context about where the error occurred
    let errorContext = 'Test run failed';
    if (error.message?.includes('build')) {
      errorContext = 'Build creation failed';
    } else if (error.message?.includes('screenshot')) {
      errorContext = 'Screenshot processing failed';
    } else if (error.message?.includes('server')) {
      errorContext = 'Server startup failed';
    }

    output.error(errorContext, error);
    exit(1);
    return { success: false, error };
  } finally {
    // Remove event listeners to prevent memory leaks
    processRemoveListener('SIGINT', sigintHandler);
    processRemoveListener('exit', exitHandler);
  }
}

/**
 * Validate run options
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 */
export function validateRunOptions(testCommand, options) {
  let errors = [];

  if (!testCommand || testCommand.trim() === '') {
    errors.push('Test command is required');
  }

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

  if (options.batchSize !== undefined) {
    let n = Number(options.batchSize);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('Batch size must be a positive integer');
    }
  }

  if (options.uploadTimeout !== undefined) {
    let n = Number(options.uploadTimeout);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('Upload timeout must be a positive integer (milliseconds)');
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
