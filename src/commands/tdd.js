import { createServices } from '../services/index.js';
import { loadConfig } from '../utils/config-loader.js';
import { detectBranch, detectCommit } from '../utils/git.js';
import * as output from '../utils/output.js';

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
  const cleanup = async () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    output.cleanup();
    if (testRunner?.cancel) {
      await testRunner.cancel();
    }
  };

  try {
    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    const config = await loadConfig(globalOptions.config, allOptions);

    // Dev mode works locally by default - only needs token for baseline download
    const needsToken = options.baselineBuild || options.baselineComparison;

    if (!config.apiKey && needsToken) {
      throw new Error(
        'API token required when using --baseline-build or --baseline-comparison flags'
      );
    }

    // Always allow no-token mode for dev mode unless baseline flags are used
    config.allowNoToken = true;

    // Collect git metadata
    const branch = await detectBranch(options.branch);
    const commit = await detectCommit(options.commit);

    // Show header (skip in daemon mode)
    if (!options.daemon) {
      const mode = config.apiKey ? 'local' : 'local';
      output.header('tdd', mode);

      // Show config in verbose mode
      output.debug('config', 'loaded', {
        port: config.server.port,
        branch,
        threshold: config.comparison.threshold,
      });
    }

    // Create services
    output.startSpinner('Initializing TDD server...');
    const configWithVerbose = { ...config, verbose: globalOptions.verbose };
    const services = createServices(configWithVerbose, 'tdd');
    testRunner = services.testRunner;
    output.stopSpinner();

    // Set up event handlers for user feedback
    testRunner.on('progress', progressData => {
      const { message: progressMessage } = progressData;
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
        output.debug('server', `listening on :${serverInfo.port}`);
      }
    });

    testRunner.on('screenshot-captured', screenshotInfo => {
      output.debug('capture', screenshotInfo.name);
    });

    testRunner.on('comparison-result', comparisonInfo => {
      const { name, status, pixelDifference } = comparisonInfo;
      if (status === 'passed') {
        output.debug('compare', `${name} passed`);
      } else if (status === 'failed') {
        output.warn(`${name}: ${pixelDifference}% difference`);
      } else if (status === 'new') {
        output.debug('compare', `${name} (new baseline)`);
      }
    });

    testRunner.on('error', error => {
      output.error('Test runner error', error);
    });

    const runOptions = {
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
    output.debug('run', testCommand);
    const runResult = await testRunner.run(runOptions);

    // Show summary
    const { screenshotsCaptured, comparisons } = runResult;

    // Determine success based on comparison results
    const hasFailures =
      runResult.failed ||
      runResult.comparisons?.some(c => c.status === 'failed');

    if (comparisons && comparisons.length > 0) {
      const passed = comparisons.filter(c => c.status === 'passed').length;
      const failed = comparisons.filter(c => c.status === 'failed').length;

      if (hasFailures) {
        output.error(
          `${failed} visual difference${failed !== 1 ? 's' : ''} detected`
        );
        output.info(`Check .vizzly/diffs/ for diff images`);
      } else {
        output.result(
          `${screenshotsCaptured} screenshot${screenshotsCaptured !== 1 ? 's' : ''} · ${passed} passed`
        );
      }
    } else {
      output.result(
        `${screenshotsCaptured} screenshot${screenshotsCaptured !== 1 ? 's' : ''}`
      );
    }

    // Return result and cleanup function
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
  const errors = [];

  if (!testCommand || testCommand.trim() === '') {
    errors.push('Test command is required');
  }

  if (options.port) {
    const port = parseInt(options.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push('Port must be a valid number between 1 and 65535');
    }
  }

  if (options.timeout) {
    const timeout = parseInt(options.timeout, 10);
    if (Number.isNaN(timeout) || timeout < 1000) {
      errors.push('Timeout must be at least 1000 milliseconds');
    }
  }

  if (options.threshold !== undefined) {
    const threshold = parseFloat(options.threshold);
    if (Number.isNaN(threshold) || threshold < 0) {
      errors.push(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    }
  }

  return errors;
}
