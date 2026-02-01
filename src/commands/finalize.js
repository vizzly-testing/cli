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

let MISSING_BUILD_HINTS = [
  '  • No screenshots were uploaded with this parallel-id',
  '  • Tests were skipped or failed before capturing screenshots',
  '  • The parallel-id does not match what was used during test runs',
];

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

    let status = error.context?.status;

    // Don't fail CI for Vizzly infrastructure issues (5xx errors)
    // Note: --strict does NOT affect 5xx handling - infrastructure issues are out of user's control
    if (status >= 500) {
      output.warn('Vizzly API unavailable - finalize skipped.');
      return {
        success: true,
        result: { skipped: true, reason: 'api-unavailable' },
      };
    }

    // Handle missing builds gracefully (404 errors)
    // This happens when: no screenshots were uploaded, tests were skipped, or parallel-id doesn't exist
    if (status === 404) {
      let isStrict = globalOptions.strict;

      if (isStrict) {
        output.error(`No build found for parallel ID: ${parallelId}`);
        output.blank();
        output.info('This can happen when:');
        for (let hint of MISSING_BUILD_HINTS) {
          output.info(hint);
        }
        exit(1);
        return { success: false, reason: 'no-build-found', error };
      }

      // Non-strict mode: warn but don't fail CI
      output.warn(
        `No build found for parallel ID: ${parallelId} - finalize skipped.`
      );
      if (globalOptions.verbose) {
        output.info('Possible reasons:');
        for (let hint of MISSING_BUILD_HINTS) {
          output.info(hint);
        }
        output.info('Use --strict flag to fail CI when no build is found.');
      }
      return {
        success: true,
        result: { skipped: true, reason: 'no-build-found' },
      };
    }

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
