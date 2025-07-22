import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { container } from '../container/index.js';
import {
  detectBranch,
  detectCommit,
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

  // Ensure cleanup on exit
  process.on('SIGINT', () => {
    ui.cleanup();
    process.exit(1);
  });
  process.on('exit', () => ui.cleanup());

  try {
    ui.info('Starting test run with Vizzly integration...');

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
    const buildName = await generateBuildNameWithGit(options.buildName);

    if (globalOptions.verbose) {
      ui.info('Configuration loaded', {
        testCommand,
        port: config.server.port,
        timeout: config.server.timeout,
        tddMode: options.tdd || false,
        branch,
        commit: commit?.substring(0, 7),
        buildName,
        environment: config.build.environment,
        allowNoToken: config.allowNoToken || false,
      });
    }

    // Get test runner service
    ui.startSpinner('Initializing test runner...');
    const testRunner = await container.get('testRunner', config);

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
      ui.info(`Screenshot server running on port ${serverInfo.port}`);
      if (globalOptions.verbose) {
        ui.info('Server details', serverInfo);
      }
    });

    testRunner.on('screenshot-captured', screenshotInfo => {
      ui.progress(`Screenshot captured: ${screenshotInfo.name}`);
    });

    testRunner.on('build-created', buildInfo => {
      ui.info(`Build created: ${buildInfo.buildId}`);
      if (buildInfo.url) {
        ui.info(`View build: ${buildInfo.url}`);
      }
    });

    testRunner.on('error', error => {
      ui.error('Test runner error occurred', error, 0); // Don't exit immediately, let runner handle it
    });

    // Prepare run options
    const runOptions = {
      testCommand,
      port: config.server.port,
      timeout: config.server.timeout,
      tddMode: options.tdd || false,
      buildName,
      branch,
      commit,
      environment: config.build.environment,
      eager: config.eager || false,
      allowNoToken: config.allowNoToken || false,
      baselineBuildId: config.baselineBuildId,
      baselineComparisonId: config.baselineComparisonId,
      wait: config.wait || options.wait || false,
    };

    // Start test run
    ui.progress('Starting test execution...');
    const result = await testRunner.run(runOptions);

    ui.success('Test run completed successfully');

    // Output results
    if (result.buildId) {
      ui.data({
        buildId: result.buildId,
        screenshotsCaptured: result.screenshotsCaptured || 0,
        testsPassed: result.testsPassed || 0,
        testsFailed: result.testsFailed || 0,
        url: result.url,
      });

      // Wait for build completion if requested
      if (runOptions.wait) {
        ui.info('Waiting for build completion...');
        ui.startSpinner('Processing comparisons...');

        const uploader = await container.get('uploader', config);
        const buildResult = await uploader.waitForBuild(result.buildId);

        ui.success('Build processing completed');
        ui.data({
          status: buildResult.status,
          comparisons: buildResult.comparisons,
          passedComparisons: buildResult.passedComparisons,
          failedComparisons: buildResult.failedComparisons,
          url: buildResult.url,
        });

        // Exit with appropriate code based on comparison results
        if (buildResult.failedComparisons > 0) {
          ui.error(
            `${buildResult.failedComparisons} visual comparisons failed`,
            {},
            1
          );
        }
      }
    } else {
      ui.data({
        testsPassed: result.testsPassed || 0,
        testsFailed: result.testsFailed || 0,
        message:
          'Tests completed without visual comparisons (no API token provided)',
      });
    }

    ui.cleanup();
  } catch (error) {
    ui.error('Test run failed', error);
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

  return errors;
}
