import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { createServiceContainer } from '../container/index.js';

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
  // Create UI handler
  const ui = new ConsoleUI({
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
      ui.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      return;
    }

    if (globalOptions.verbose) {
      ui.info('Configuration loaded', {
        parallelId,
        apiUrl: config.apiUrl,
      });
    }

    // Create service container and get API service
    ui.startSpinner('Finalizing parallel build...');
    const container = await createServiceContainer(config, 'finalize');
    const apiService = await container.get('api');
    ui.stopSpinner();

    // Call finalize endpoint
    const result = await apiService.finalizeParallelBuild(parallelId);

    if (globalOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      ui.success(`Parallel build ${result.build.id} finalized successfully`);
      ui.info(`Status: ${result.build.status}`);
      ui.info(`Parallel ID: ${result.build.parallel_id}`);
    }
  } catch (error) {
    ui.stopSpinner();
    ui.error('Failed to finalize parallel build', error);
  } finally {
    ui.cleanup();
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
