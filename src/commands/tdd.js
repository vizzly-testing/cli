import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { createServiceContainer } from '../container/index.js';
import { detectBranch, detectCommit } from '../utils/git.js';

/**
 * TDD command implementation
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @returns {Promise<{result: Object, cleanup: Function}>} Result and cleanup function
 */
export async function tddCommand(
  testCommand,
  options = {},
  globalOptions = {}
) {
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let testRunner = null;
  let isCleanedUp = false;

  // Create cleanup function that can be called by the caller
  const cleanup = async () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    ui.cleanup();
    if (testRunner?.cancel) {
      await testRunner.cancel();
    }
  };

  try {
    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    const config = await loadConfig(globalOptions.config, allOptions);

    // Auto-detect missing token and allow no-token mode for TDD
    if (!config.apiKey) {
      config.allowNoToken = true;
      ui.warning('No API token detected - running in local-only mode');
    }

    // Collect git metadata
    const branch = await detectBranch(options.branch);
    const commit = await detectCommit(options.commit);

    if (globalOptions.verbose) {
      ui.info('TDD Configuration loaded', {
        testCommand,
        port: config.server.port,
        timeout: config.server.timeout,
        branch,
        commit: commit?.substring(0, 7),
        environment: config.build.environment,
        threshold: config.comparison.threshold,
        baselineBuildId: config.baselineBuildId,
        baselineComparisonId: config.baselineComparisonId,
      });
    }

    // Create service container and get services
    ui.startSpinner('Initializing TDD mode...');
    const configWithVerbose = { ...config, verbose: globalOptions.verbose };
    const container = await createServiceContainer(configWithVerbose, 'tdd');

    testRunner = await container.get('testRunner');
    ui.stopSpinner();

    // Set up event handlers for user feedback
    testRunner.on('progress', progressData => {
      const { message: progressMessage } = progressData;
      ui.progress(progressMessage || 'Running TDD tests...');
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
        ui.info(`TDD screenshot server running on port ${serverInfo.port}`);
        ui.info('Server details', serverInfo);
      }
    });

    testRunner.on('screenshot-captured', screenshotInfo => {
      ui.info(`Vizzly TDD: Screenshot captured - ${screenshotInfo.name}`);
    });

    testRunner.on('comparison-result', comparisonInfo => {
      const { name, status, pixelDifference } = comparisonInfo;
      if (status === 'passed') {
        ui.info(`✅ ${name}: Visual comparison passed`);
      } else if (status === 'failed') {
        ui.warning(
          `❌ ${name}: Visual comparison failed (${pixelDifference}% difference)`
        );
      } else if (status === 'new') {
        ui.warning(`🆕 ${name}: New screenshot (no baseline)`);
      }
    });

    testRunner.on('error', error => {
      ui.error('TDD test runner error occurred', error, 0); // Don't exit immediately
    });

    // Show informational messages about baseline behavior
    if (options.setBaseline) {
      ui.info(
        '🐻 Baseline update mode - will ignore existing baselines and create new ones'
      );
    } else if (config.baselineBuildId || config.baselineComparisonId) {
      ui.info(
        'API token available - will fetch remote baselines for local comparison'
      );
    } else if (config.apiKey) {
      ui.info(
        'API token available - will use existing local baselines or create new ones'
      );
    } else {
      ui.warning(
        'Running without API token - all screenshots will be marked as new'
      );
    }

    const runOptions = {
      testCommand,
      port: config.server.port,
      timeout: config.server.timeout,
      tdd: true,
      setBaseline: options.setBaseline || false, // Pass through baseline update mode
      branch,
      commit,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      allowNoToken: config.allowNoToken || false, // Pass through the allow-no-token setting
      baselineBuildId: config.baselineBuildId,
      baselineComparisonId: config.baselineComparisonId,
      wait: false, // No build to wait for in TDD mode
    };

    ui.info('Starting TDD test execution...');
    const result = await testRunner.run(runOptions);

    // Show TDD summary
    const { screenshotsCaptured, comparisons } = result;

    console.log(`🐻 Vizzly TDD: Processed ${screenshotsCaptured} screenshots`);

    if (comparisons && comparisons.length > 0) {
      const passed = comparisons.filter(c => c.status === 'passed').length;
      const failed = comparisons.filter(c => c.status === 'failed').length;
      const newScreenshots = comparisons.filter(c => c.status === 'new').length;

      console.log(
        `📊 Results: ${passed} passed, ${failed} failed, ${newScreenshots} new`
      );

      if (failed > 0) {
        console.log(`🔍 Check diff images in .vizzly/diffs/ directory`);
      }
    }

    ui.success('TDD test run completed');

    // Determine success based on comparison results
    const hasFailures =
      result.failed ||
      (result.comparisons &&
        result.comparisons.some(c => c.status === 'failed'));

    if (hasFailures) {
      ui.error('Visual differences detected in TDD mode', {}, 0);
    }

    // Return result and cleanup function
    return {
      result: {
        success: !hasFailures,
        exitCode: hasFailures ? 1 : 0,
        ...result,
      },
      cleanup,
    };
  } catch (error) {
    ui.error('TDD test run failed', error);
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

  if (options.threshold !== undefined) {
    const threshold = parseFloat(options.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      errors.push('Threshold must be a number between 0 and 1');
    }
  }

  return errors;
}
