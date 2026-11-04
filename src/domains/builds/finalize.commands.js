/**
 * Finalize command implementation
 * Uses functional API operations directly
 */

import * as defaultOutput from '../../shared/output.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import { resolveCredential } from '../auth/credential.service.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';
import { requireUploadDestination } from '../projects/upload-destination.service.js';
import { writeSession as defaultWriteSession } from '../runs/session-store.js';
import { finalizeParallelBuild as defaultFinalizeParallelBuild } from './build.service.js';

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

    if (!config.apiKey && !config.userToken) {
      output.error(
        'Login or API token required. Run vizzly login, use --token, or set VIZZLY_TOKEN.'
      );
      exit(1);
      return { success: false, reason: 'no-api-key' };
    }

    let credential = resolveCredential(config, { command: 'finalize' });
    let destination =
      credential.kind === 'user'
        ? await requireUploadDestination(config)
        : null;
    credential = destination?.credential || credential;

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
      token: credential.token,
      credential,
      command: 'finalize',
    });
    let result = await finalizeParallelBuild(
      client,
      parallelId,
      destination?.projectQuery
    );
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
