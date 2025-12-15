/**
 * Finalize command implementation
 * Uses functional API operations directly
 */

import {
  createApiClient as defaultCreateApiClient,
  finalizeParallelBuild as defaultFinalizeParallelBuild,
} from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Finalize command implementation
 * @param {string} parallelId - Parallel ID to finalize
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function finalizeCommand(
  parallelId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    finalizeParallelBuild = defaultFinalizeParallelBuild,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

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
      exit(1);
      return { success: false, reason: 'no-api-key' };
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

    return { success: true, result };
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to finalize parallel build', error);
    exit(1);
    return { success: false, error };
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
