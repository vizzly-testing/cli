import { createServices } from '../services/index.js';
import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';

/**
 * Finalize command implementation
 * @param {string} parallelId - Parallel ID to finalize
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function finalizeCommand(
  parallelId,
  options = {},
  globalOptions = {}
) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    const config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      process.exit(1);
    }

    if (globalOptions.verbose) {
      output.info('Configuration loaded');
      output.debug('Config details', {
        parallelId,
        apiUrl: config.apiUrl,
      });
    }

    // Create services and get API service
    output.startSpinner('Finalizing parallel build...');
    const services = createServices(config, 'finalize');
    const apiService = services.apiService;
    output.stopSpinner();

    // Call finalize endpoint
    const result = await apiService.finalizeParallelBuild(parallelId);

    if (globalOptions.json) {
      output.data(result);
    } else {
      output.success(
        `Parallel build ${result.build.id} finalized successfully`
      );
      output.info(`Status: ${result.build.status}`);
      output.info(`Parallel ID: ${result.build.parallel_id}`);
    }
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to finalize parallel build', error);
    process.exit(1);
  } finally {
    output.cleanup();
  }
}

/**
 * Validate finalize options
 * @param {string} parallelId - Parallel ID to finalize
 * @param {Object} options - Command options
 */
export function validateFinalizeOptions(parallelId, _options) {
  const errors = [];

  if (!parallelId || parallelId.trim() === '') {
    errors.push('Parallel ID is required');
  }

  return errors;
}
