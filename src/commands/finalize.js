/**
 * Finalize command implementation
 * Uses functional API operations directly
 */

import { createApiClient, finalizeParallelBuild } from '../api/index.js';
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
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

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

    // Call finalize endpoint via functional API
    output.startSpinner('Finalizing parallel build...');
    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'finalize',
    });
    let result = await finalizeParallelBuild(client, parallelId);
    output.stopSpinner();

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
  let errors = [];

  if (!parallelId || parallelId.trim() === '') {
    errors.push('Parallel ID is required');
  }

  return errors;
}
