import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { createServiceContainer } from '../container/index.js';
import {
  detectBranch,
  detectCommit,
  detectCommitMessage,
  generateBuildNameWithGit,
} from '../utils/git.js';
import { ApiService } from '../services/api-service.js';

/**
 * Construct proper build URL with org/project context
 * @param {string} buildId - Build ID
 * @param {string} apiUrl - API base URL
 * @param {string} apiToken - API token
 * @returns {Promise<string>} Proper build URL
 */
async function constructBuildUrl(buildId, apiUrl, apiToken) {
  try {
    const apiService = new ApiService({
      baseUrl: apiUrl,
      token: apiToken,
      command: 'upload',
    });

    const tokenContext = await apiService.getTokenContext();
    const baseUrl = apiUrl.replace(/\/api.*$/, '');

    if (tokenContext.organization?.slug && tokenContext.project?.slug) {
      return `${baseUrl}/${tokenContext.organization.slug}/${tokenContext.project.slug}/builds/${buildId}`;
    }
  } catch (error) {
    // Fall back to simple URL if context fetch fails
    console.debug(
      'Failed to fetch token context, using fallback URL:',
      error.message
    );
  }

  // Fallback URL construction
  const baseUrl = apiUrl.replace(/\/api.*$/, '');
  return `${baseUrl}/builds/${buildId}`;
}

/**
 * Upload command implementation
 * @param {string} screenshotsPath - Path to screenshots
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function uploadCommand(
  screenshotsPath,
  options = {},
  globalOptions = {}
) {
  // Create UI handler
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  // Note: ConsoleUI handles cleanup via global process listeners

  let buildId = null;
  let config = null;
  const uploadStartTime = Date.now();

  try {
    ui.info('Starting upload process...');

    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      ui.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      return; // Won't reach here due to process.exit in error()
    }

    // Collect git metadata if not provided
    const branch = await detectBranch(options.branch);
    const commit = await detectCommit(options.commit);
    const message = options.message || (await detectCommitMessage());
    const buildName = await generateBuildNameWithGit(options.buildName);

    ui.info(`Uploading screenshots from: ${screenshotsPath}`);
    if (globalOptions.verbose) {
      ui.info('Configuration loaded', {
        branch,
        commit: commit?.substring(0, 7),
        environment: config.build.environment,
        buildName: config.build.name,
      });
    }

    // Get uploader service
    ui.startSpinner('Initializing uploader...');
    const container = await createServiceContainer(config, 'upload');
    const uploader = await container.get('uploader');

    // Prepare upload options with progress callback
    const uploadOptions = {
      screenshotsDir: screenshotsPath,
      buildName,
      branch,
      commit,
      message,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      uploadAll: options.uploadAll || false,
      metadata: options.metadata ? JSON.parse(options.metadata) : {},
      onProgress: progressData => {
        const {
          message: progressMessage,
          current,
          total,
          phase,
          buildId: progressBuildId,
        } = progressData;

        // Track buildId when it becomes available
        if (progressBuildId) {
          buildId = progressBuildId;
        }

        let displayMessage = progressMessage;
        if (!displayMessage && phase) {
          if (current !== undefined && total !== undefined) {
            displayMessage = `${phase}: ${current}/${total}`;
          } else {
            displayMessage = phase;
          }
        }

        ui.progress(displayMessage || 'Processing...', current, total);
      },
    };

    // Start upload
    ui.progress('Starting upload...');
    const result = await uploader.upload(uploadOptions);
    buildId = result.buildId; // Ensure we have the buildId

    // Mark build as completed
    if (result.buildId) {
      ui.progress('Finalizing build...');
      try {
        const apiService = new ApiService({
          baseUrl: config.apiUrl,
          token: config.apiKey,
          command: 'upload',
        });
        const executionTime = Date.now() - uploadStartTime;
        await apiService.finalizeBuild(result.buildId, true, executionTime);
      } catch (error) {
        ui.warning(`Failed to finalize build: ${error.message}`);
      }
    }

    ui.success('Upload completed successfully');

    // Show Vizzly summary
    if (result.buildId) {
      ui.info(
        `🐻 Vizzly: Uploaded ${result.stats.uploaded} of ${result.stats.total} screenshots to build ${result.buildId}`
      );
      // Use API-provided URL or construct proper URL with org/project context
      const buildUrl =
        result.url ||
        (await constructBuildUrl(result.buildId, config.apiUrl, config.apiKey));
      ui.info(`🔗 Vizzly: View results at ${buildUrl}`);
    }

    // Wait for build completion if requested
    if (options.wait && result.buildId) {
      ui.info('Waiting for build completion...');
      ui.startSpinner('Processing comparisons...');

      const buildResult = await uploader.waitForBuild(result.buildId);

      ui.success('Build processing completed');

      // Show build processing results
      if (buildResult.failedComparisons > 0) {
        ui.warning(
          `${buildResult.failedComparisons} visual comparisons failed`
        );
      } else {
        ui.success(
          `All ${buildResult.passedComparisons} visual comparisons passed`
        );
      }
      // Use API-provided URL or construct proper URL with org/project context
      const buildUrl =
        buildResult.url ||
        (await constructBuildUrl(result.buildId, config.apiUrl, config.apiKey));
      ui.info(`🔗 Vizzly: View results at ${buildUrl}`);
    }

    ui.cleanup();
  } catch (error) {
    // Mark build as failed if we have a buildId and config
    if (buildId && config) {
      try {
        const apiService = new ApiService({
          baseUrl: config.apiUrl,
          token: config.apiKey,
          command: 'upload',
        });
        const executionTime = Date.now() - uploadStartTime;
        await apiService.finalizeBuild(buildId, false, executionTime);
      } catch {
        // Silent fail on cleanup
      }
    }
    ui.error('Upload failed', error);
  }
}

/**
 * Validate upload options
 * @param {string} screenshotsPath - Path to screenshots
 * @param {Object} options - Command options
 */
export function validateUploadOptions(screenshotsPath, options) {
  const errors = [];

  if (!screenshotsPath) {
    errors.push('Screenshots path is required');
  }

  if (options.metadata) {
    try {
      JSON.parse(options.metadata);
    } catch {
      errors.push('Invalid JSON in --metadata option');
    }
  }

  if (options.threshold !== undefined) {
    const threshold = parseFloat(options.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      errors.push('Threshold must be a number between 0 and 1');
    }
  }

  if (options.batchSize !== undefined) {
    const n = parseInt(options.batchSize, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Batch size must be a positive integer');
    }
  }

  if (options.uploadTimeout !== undefined) {
    const n = parseInt(options.uploadTimeout, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Upload timeout must be a positive integer (milliseconds)');
    }
  }

  return errors;
}
