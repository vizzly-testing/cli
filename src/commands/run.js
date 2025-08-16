import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { createServiceContainer } from '../container/index.js';
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
  // Create UI handler
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let testRunner = null;
  let runResult = null;

  // Ensure cleanup on exit
  const cleanup = async () => {
    ui.cleanup();
    if (testRunner && runResult && runResult.buildId) {
      try {
        // Try to finalize build on interruption
        await testRunner.finalizeBuild(
          runResult.buildId,
          false,
          false,
          Date.now() - (runResult.startTime || Date.now())
        );
      } catch {
        // Silent fail on cleanup
      }
    }
  };

  const sigintHandler = async () => {
    await cleanup();
    process.exit(1);
  };

  const exitHandler = () => ui.cleanup();

  process.on('SIGINT', sigintHandler);
  process.on('exit', exitHandler);

  try {
    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    const config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token (unless --allow-no-token is set)
    if (!config.apiKey && !config.allowNoToken) {
      ui.error(
        'API token required. Use --token, set VIZZLY_TOKEN environment variable, or use --allow-no-token to run without uploading'
      );
      return;
    }

    // Collect git metadata and build info
    const branch = await detectBranch(options.branch);
    const commit = await detectCommit(options.commit);
    const message = options.message || (await detectCommitMessage());
    const buildName = await generateBuildNameWithGit(options.buildName);
    const pullRequestNumber = detectPullRequestNumber();

    if (globalOptions.verbose) {
      ui.info('Configuration loaded', {
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
    ui.startSpinner('Initializing test runner...');
    const configWithVerbose = {
      ...config,
      verbose: globalOptions.verbose,
      uploadAll: options.uploadAll || false,
    };
    const command = 'run';
    const container = await createServiceContainer(configWithVerbose, command);
    testRunner = await container.get('testRunner'); // Assign to outer scope variable
    ui.stopSpinner();

    // Track build URL for display
    let buildUrl = null;

    // Set up event handlers
    testRunner.on('progress', progressData => {
      const { message: progressMessage } = progressData;
      ui.progress(progressMessage || 'Running tests...');
    });

    testRunner.on('test-output', output => {
      // In non-JSON mode, show test output directly
      if (!globalOptions.json) {
        ui.stopSpinner();
        console.log(output.data);
      }
    });

    testRunner.on('server-ready', serverInfo => {
      if (globalOptions.verbose) {
        ui.info(`Screenshot server running on port ${serverInfo.port}`);
        ui.info('Server details', serverInfo);
      }
    });

    testRunner.on('screenshot-captured', screenshotInfo => {
      // Use UI for consistent formatting
      ui.info(`Vizzly: Screenshot captured - ${screenshotInfo.name}`);
    });

    testRunner.on('build-created', buildInfo => {
      buildUrl = buildInfo.url;
      // Debug: Log build creation details
      if (globalOptions.verbose) {
        ui.info(`Build created: ${buildInfo.buildId} - ${buildInfo.name}`);
      }
      // Use UI for consistent formatting
      if (buildUrl) {
        ui.info(`Vizzly: ${buildUrl}`);
      }
    });

    testRunner.on('build-failed', buildError => {
      ui.error('Failed to create build', buildError);
    });

    testRunner.on('error', error => {
      ui.stopSpinner(); // Stop spinner to ensure error is visible
      ui.error('Test runner error occurred', error, 0); // Don't exit immediately, let runner handle it
    });

    testRunner.on('build-finalize-failed', errorInfo => {
      ui.warning(
        `Failed to finalize build ${errorInfo.buildId}: ${errorInfo.error}`
      );
    });

    // Prepare run options
    const runOptions = {
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
    };

    // Start test run
    ui.info('Starting test execution...');
    runResult = { startTime: Date.now() };
    const result = await testRunner.run(runOptions);
    runResult = { ...runResult, ...result };

    ui.success('Test run completed successfully');

    // Show Vizzly summary
    if (result.buildId) {
      console.log(
        `🐻 Vizzly: Captured ${result.screenshotsCaptured} screenshots in build ${result.buildId}`
      );
      if (result.url) {
        console.log(`🔗 Vizzly: View results at ${result.url}`);
      }
    }

    // Output results
    if (result.buildId) {
      // Wait for build completion if requested
      if (runOptions.wait) {
        ui.info('Waiting for build completion...');
        ui.startSpinner('Processing comparisons...');

        const uploader = await container.get('uploader');
        const buildResult = await uploader.waitForBuild(result.buildId);

        ui.success('Build processing completed');

        // Exit with appropriate code based on comparison results
        if (buildResult.failedComparisons > 0) {
          ui.error(
            `${buildResult.failedComparisons} visual comparisons failed`,
            {},
            0
          );
          // Return error status without calling process.exit in tests
          return { success: false, exitCode: 1 };
        }
      }
    }

    ui.cleanup();
  } catch (error) {
    ui.stopSpinner(); // Ensure spinner is stopped before showing error

    // Provide more context about where the error occurred
    let errorContext = 'Test run failed';
    if (error.message && error.message.includes('build')) {
      errorContext = 'Build creation failed';
    } else if (error.message && error.message.includes('screenshot')) {
      errorContext = 'Screenshot processing failed';
    } else if (error.message && error.message.includes('server')) {
      errorContext = 'Server startup failed';
    }

    ui.error(errorContext, error);
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
  const errors = [];

  if (!testCommand || testCommand.trim() === '') {
    errors.push('Test command is required');
  }

  if (options.port) {
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('Port must be a valid number between 1 and 65535');
    }
  }

  if (options.timeout) {
    const timeout = parseInt(options.timeout, 10);
    if (isNaN(timeout) || timeout < 1000) {
      errors.push('Timeout must be at least 1000 milliseconds');
    }
  }

  if (options.batchSize !== undefined) {
    const n = parseInt(options.batchSize, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Batch size must be a positive integer');
    }
  }

  if (options.uploadTimeout !== undefined) {
    const n = parseInt(options.uploadTimeout, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Upload timeout must be a positive integer (milliseconds)');
    }
  }

  return errors;
}
