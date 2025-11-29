import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';
import { createServices } from '../services/index.js';
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
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let testRunner = null;
  let isCleanedUp = false;

  // Create cleanup function that can be called by the caller
  let cleanup = async () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    output.cleanup();
    if (testRunner?.cancel) {
      await testRunner.cancel();
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

    if (!config.apiKey && !options.daemon) {
      output.info('Running in local-only mode (no API token)');
    } else if (!needsToken && !options.daemon) {
      output.info('Running in local mode (API token available but not needed)');
    }

    // Collect git metadata
    let branch = await detectBranch(options.branch);
    let commit = await detectCommit(options.commit);

    // Only show config in verbose mode for non-daemon (daemon shows baseline info instead)
    if (globalOptions.verbose && !options.daemon) {
      output.info('TDD Configuration loaded');
      output.debug('Config details', {
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

    // Create services
    output.startSpinner('Initializing TDD server...');
    let configWithVerbose = { ...config, verbose: globalOptions.verbose };
    let services = createServices(configWithVerbose, 'tdd');
    testRunner = services.testRunner;
    output.stopSpinner();

    // Set up event handlers for user feedback
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
      // Only show in non-daemon mode (daemon shows its own startup message)
      if (!options.daemon) {
        output.info(`TDD screenshot server running on port ${serverInfo.port}`);
        output.info(`Dashboard: http://localhost:${serverInfo.port}/dashboard`);
      }
      // Verbose server details only in non-daemon mode
      if (globalOptions.verbose && !options.daemon) {
        output.debug('Server started', {
          port: serverInfo.port,
          pid: serverInfo.pid,
          uptime: serverInfo.uptime,
        });
      }
    });

    testRunner.on('screenshot-captured', screenshotInfo => {
      output.info(`Vizzly TDD: Screenshot captured - ${screenshotInfo.name}`);
    });

    testRunner.on('comparison-result', comparisonInfo => {
      let { name, status, pixelDifference } = comparisonInfo;
      if (status === 'passed') {
        output.info(`✅ ${name}: Visual comparison passed`);
      } else if (status === 'failed') {
        output.warn(
          `❌ ${name}: Visual comparison failed (${pixelDifference}% difference)`
        );
      } else if (status === 'new') {
        output.warn(`🆕 ${name}: New screenshot (no baseline)`);
      }
    });

    testRunner.on('error', error => {
      output.error('TDD test runner error occurred', error);
    });

    // Show informational messages about baseline behavior (skip in daemon mode)
    if (!options.daemon) {
      if (options.setBaseline) {
        output.info(
          '🐻 Baseline update mode - will ignore existing baselines and create new ones'
        );
      } else if (options.baselineBuild || options.baselineComparison) {
        output.info(
          '📥 Will fetch remote baselines from Vizzly for local comparison'
        );
      } else {
        output.info(
          '📁 Will use local baselines or create new ones when screenshots differ'
        );
      }
    }

    let runOptions = {
      testCommand,
      port: config.server.port,
      timeout: config.server.timeout,
      tdd: true,
      daemon: options.daemon || false, // Daemon mode flag
      setBaseline: options.setBaseline || false, // Pass through baseline update mode
      branch,
      commit,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      allowNoToken: config.allowNoToken || false, // Pass through the allow-no-token setting
      baselineBuildId: config.baselineBuildId,
      baselineComparisonId: config.baselineComparisonId,
      wait: false, // No build to wait for in dev mode
    };

    // In daemon mode, just start the server without running tests
    if (options.daemon) {
      await testRunner.initialize(runOptions);

      // Return immediately so daemon can set up its lifecycle
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
    output.info('Starting test execution...');
    let result = await testRunner.run(runOptions);

    // Show summary
    let { screenshotsCaptured, comparisons } = result;

    output.print(`🐻 Vizzly TDD: Processed ${screenshotsCaptured} screenshots`);

    if (comparisons && comparisons.length > 0) {
      let passed = comparisons.filter(c => c.status === 'passed').length;
      let failed = comparisons.filter(c => c.status === 'failed').length;
      let newScreenshots = comparisons.filter(c => c.status === 'new').length;

      output.print(
        `📊 Results: ${passed} passed, ${failed} failed, ${newScreenshots} new`
      );

      if (failed > 0) {
        output.print(`🔍 Check diff images in .vizzly/diffs/ directory`);
      }
    }

    output.success('TDD test run completed');

    // Determine success based on comparison results
    let hasFailures =
      result.failed ||
      (result.comparisons &&
        result.comparisons.some(c => c.status === 'failed'));

    if (hasFailures) {
      output.error('Visual differences detected in TDD mode');
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
    output.error('TDD test run failed', error);
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

  if (options.threshold !== undefined) {
    let threshold = parseFloat(options.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      errors.push('Threshold must be a number between 0 and 1');
    }
  }

  return errors;
}
