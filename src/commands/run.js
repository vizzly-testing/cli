/**
 * Run command implementation
 * Uses functional operations directly - no class wrappers needed
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import {
  createBuild as createApiBuild,
  createApiClient,
  finalizeBuild as finalizeApiBuild,
  getBuild,
} from '../api/index.js';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createApiHandler } from '../server/handlers/api-handler.js';
import { createTddHandler } from '../server/handlers/tdd-handler.js';
import { createHttpServer } from '../server/http-server.js';
import {
  buildServerInterface,
  getTddResults,
  startServer,
  stopServer,
} from '../server-manager/index.js';
import { createBuildObject } from '../services/build-manager.js';
import { createUploader } from '../services/uploader.js';
import { finalizeBuild, runTests } from '../test-runner/index.js';
import { loadConfig } from '../utils/config-loader.js';
import {
  detectBranch,
  detectCommit,
  detectCommitMessage,
  detectPullRequestNumber,
  generateBuildNameWithGit,
} from '../utils/git.js';
import * as output from '../utils/output.js';

/**
 * Create a server manager object that provides the interface runTests expects.
 */
function createServerManager(config, services = {}) {
  let httpServer = null;
  let handler = null;

  let deps = {
    createHttpServer,
    createTddHandler,
    createApiHandler,
    createApiClient,
    fs: { mkdirSync, writeFileSync, existsSync, unlinkSync },
  };

  return {
    async start(buildId, tddMode, setBaseline) {
      let result = await startServer({
        config,
        buildId,
        tddMode,
        setBaseline,
        projectRoot: process.cwd(),
        services,
        deps,
      });
      httpServer = result.httpServer;
      handler = result.handler;
    },

    async stop() {
      await stopServer({
        httpServer,
        handler,
        projectRoot: process.cwd(),
        deps,
      });
    },

    async getTddResults() {
      return getTddResults({ tddMode: true, handler });
    },

    get server() {
      return buildServerInterface({ handler, httpServer });
    },
  };
}

/**
 * Run command implementation
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function runCommand(
  testCommand,
  options = {},
  globalOptions = {}
) {
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
    process.exit(1);
  };

  let exitHandler = () => output.cleanup();

  process.on('SIGINT', sigintHandler);
  process.on('exit', exitHandler);

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
      process.exit(1);
    }

    // Collect git metadata and build info
    let branch = await detectBranch(options.branch);
    let commit = await detectCommit(options.commit);
    let message = options.message || (await detectCommitMessage());
    let buildName = await generateBuildNameWithGit(options.buildName);
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
      eager: config.eager || false,
      allowNoToken: config.allowNoToken || false,
      wait: config.wait || options.wait || false,
      uploadAll: options.uploadAll || false,
      pullRequestNumber,
      parallelId: config.parallelId,
    };

    // Start test run
    output.info('Starting test execution...');
    startTime = Date.now();
    isTddMode = runOptions.tdd || false;

    let result;
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
          createError: (message, code) => new VizzlyError(message, code),
          output,
          onBuildCreated: data => {
            buildUrl = data.url;
            buildId = data.buildId;
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

      output.success('Test run completed successfully');

      // Show Vizzly summary
      if (result.buildId) {
        output.print(
          `🐻 Vizzly: Captured ${result.screenshotsCaptured} screenshots in build ${result.buildId}`
        );
        if (result.url) {
          output.print(`🔗 Vizzly: View results at ${result.url}`);
        }
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
        let exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 1;

        output.error('Test run failed');
        return { success: false, exitCode };
      } else {
        // Setup or other error - VizzlyError.getUserMessage() provides context
        output.error('Test run failed', error);
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
  } catch (error) {
    output.stopSpinner();

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
    process.exit(1);
  } finally {
    // Remove event listeners to prevent memory leaks
    process.removeListener('SIGINT', sigintHandler);
    process.removeListener('exit', exitHandler);
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

  if (options.batchSize !== undefined) {
    let n = parseInt(options.batchSize, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Batch size must be a positive integer');
    }
  }

  if (options.uploadTimeout !== undefined) {
    let n = parseInt(options.uploadTimeout, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Upload timeout must be a positive integer (milliseconds)');
    }
  }

  return errors;
}
