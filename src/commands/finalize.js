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
import { writeSession as defaultWriteSession } from '../utils/session.js';

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
    writeSession = defaultWriteSession,
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

    // Write session for subsequent commands (like preview)
    if (result.build?.id) {
      writeSession({
        buildId: result.build.id,
        parallelId,
      });
    }

    if (globalOptions.json) {
      output.data(result);
    } else {
      output.header('finalize');
      output.complete(`Parallel build finalized`);
      output.blank();
      output.keyValue({
        Build: result.build.id,
        Status: result.build.status,
        'Parallel ID': result.build.parallel_id,
      });
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
