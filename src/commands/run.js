import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';
import { createServices } from '../services/index.js';
import {
  detectBranch,
  detectCommit,
  detectCommitMessage,
  detectPullRequestNumber,
  generateBuildNameWithGit,
} from '../utils/git.js';

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

  let testRunner = null;
  let buildId = null;
  let startTime = null;
  let isTddMode = false;

  // Ensure cleanup on exit
  let cleanup = async () => {
    output.cleanup();

    // Cancel test runner (kills process and stops server)
    if (testRunner) {
      try {
        await testRunner.cancel();
      } catch {
        // Silent fail
      }
    }

    // Finalize build if we have one
    if (testRunner && buildId) {
      try {
        let executionTime = Date.now() - (startTime || Date.now());
        await testRunner.finalizeBuild(
          buildId,
          isTddMode,
          false,
          executionTime
        );
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

    let config = await loadConfig(globalOptions.config, allOptions);

    output.debug('[RUN] Config loaded', {
      hasApiKey: !!config.apiKey,
      apiKeyPrefix: config.apiKey
        ? config.apiKey.substring(0, 8) + '***'
        : 'NONE',
    });

    if (globalOptions.verbose) {
      output.info('Token check:');
      output.debug('Token details', {
        hasApiKey: !!config.apiKey,
        apiKeyType: typeof config.apiKey,
        apiKeyPrefix:
          typeof config.apiKey === 'string' && config.apiKey
            ? config.apiKey.substring(0, 10) + '...'
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

    // Create service container and get test runner service
    output.startSpinner('Initializing test runner...');
    let configWithVerbose = {
      ...config,
      verbose: globalOptions.verbose,
      uploadAll: options.uploadAll || false,
    };

    output.debug('[RUN] Creating services', {
      hasApiKey: !!configWithVerbose.apiKey,
    });

    let services = createServices(configWithVerbose, 'run');
    testRunner = services.testRunner;
    output.stopSpinner();

    // Track build URL for display
    let buildUrl = null;

    // Set up event handlers
    testRunner.on('progress', progressData => {
      let { message: progressMessage } = progressData;
      output.progress(progressMessage || 'Running tests...');
    });

    testRunner.on('test-output', data => {
      // In non-JSON mode, show test output directly
      if (!globalOptions.json) {
        output.stopSpinner();
        output.print(data.data);
      }
    });

    testRunner.on('server-ready', serverInfo => {
      if (globalOptions.verbose) {
        output.info(`Screenshot server running on port ${serverInfo.port}`);
        output.debug('Server details', serverInfo);
      }
    });

    testRunner.on('screenshot-captured', screenshotInfo => {
      output.info(`Vizzly: Screenshot captured - ${screenshotInfo.name}`);
    });

    testRunner.on('build-created', buildInfo => {
      buildUrl = buildInfo.url;
      buildId = buildInfo.buildId;
      if (globalOptions.verbose) {
        output.info(`Build created: ${buildInfo.buildId} - ${buildInfo.name}`);
      }
      if (buildUrl) {
        output.info(`Vizzly: ${buildUrl}`);
      }
    });

    testRunner.on('build-failed', buildError => {
      output.error('Failed to create build', buildError);
    });

    testRunner.on('error', error => {
      output.stopSpinner();
      output.error('Test runner error occurred', error);
    });

    testRunner.on('build-finalize-failed', errorInfo => {
      output.warn(
        `Failed to finalize build ${errorInfo.buildId}: ${errorInfo.error}`
      );
    });

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
      result = await testRunner.run(runOptions);

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

        let { uploader } = services;
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
    if (error.message && error.message.includes('build')) {
      errorContext = 'Build creation failed';
    } else if (error.message && error.message.includes('screenshot')) {
      errorContext = 'Screenshot processing failed';
    } else if (error.message && error.message.includes('server')) {
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
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Port must be a valid number between 1 and 65535');
    }
  }

  if (options.timeout) {
    let timeout = parseInt(options.timeout, 10);
    if (isNaN(timeout) || timeout < 1000) {
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
