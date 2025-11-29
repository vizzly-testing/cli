import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';
import { createServices } from '../services/index.js';
import {
  detectBranch,
  detectCommit,
  detectCommitMessage,
  detectPullRequestNumber,
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
    let apiService = new ApiService({
      baseUrl: apiUrl,
      token: apiToken,
      command: 'upload',
    });

    let tokenContext = await apiService.getTokenContext();
    let baseUrl = apiUrl.replace(/\/api.*$/, '');

    if (tokenContext.organization?.slug && tokenContext.project?.slug) {
      return `${baseUrl}/${tokenContext.organization.slug}/${tokenContext.project.slug}/builds/${buildId}`;
    }
  } catch (error) {
    // Fall back to simple URL if context fetch fails
    output.debug('Failed to fetch token context, using fallback URL:', {
      error: error.message,
    });
  }

  // Fallback URL construction
  let baseUrl = apiUrl.replace(/\/api.*$/, '');
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
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let buildId = null;
  let config = null;
  let uploadStartTime = Date.now();

  try {
    output.info('Starting upload process...');

    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };
    config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      process.exit(1);
    }

    // Collect git metadata if not provided
    let branch = await detectBranch(options.branch);
    let commit = await detectCommit(options.commit);
    let message = options.message || (await detectCommitMessage());
    let buildName = await generateBuildNameWithGit(options.buildName);
    let pullRequestNumber = detectPullRequestNumber();

    output.info(`Uploading screenshots from: ${screenshotsPath}`);
    if (globalOptions.verbose) {
      output.info('Configuration loaded');
      output.debug('Config details', {
        branch,
        commit: commit?.substring(0, 7),
        environment: config.build.environment,
        buildName: config.build.name,
      });
    }

    // Get uploader service
    output.startSpinner('Initializing uploader...');
    let services = createServices(config, 'upload');
    let uploader = services.uploader;

    // Prepare upload options with progress callback
    let uploadOptions = {
      screenshotsDir: screenshotsPath,
      buildName,
      branch,
      commit,
      message,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      uploadAll: options.uploadAll || false,
      metadata: options.metadata ? JSON.parse(options.metadata) : {},
      pullRequestNumber,
      parallelId: config.parallelId,
      onProgress: progressData => {
        let {
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

        output.progress(displayMessage || 'Processing...', current, total);
      },
    };

    // Start upload
    output.progress('Starting upload...');
    let result = await uploader.upload(uploadOptions);
    buildId = result.buildId; // Ensure we have the buildId

    // Mark build as completed
    if (result.buildId) {
      output.progress('Finalizing build...');
      try {
        let apiService = new ApiService({
          baseUrl: config.apiUrl,
          token: config.apiKey,
          command: 'upload',
        });
        let executionTime = Date.now() - uploadStartTime;
        await apiService.finalizeBuild(result.buildId, true, executionTime);
      } catch (error) {
        output.warn(`Failed to finalize build: ${error.message}`);
      }
    }

    output.success('Upload completed successfully');

    // Show Vizzly summary
    if (result.buildId) {
      output.info(
        `🐻 Vizzly: Uploaded ${result.stats.uploaded} of ${result.stats.total} screenshots to build ${result.buildId}`
      );
      // Use API-provided URL or construct proper URL with org/project context
      let buildUrl =
        result.url ||
        (await constructBuildUrl(result.buildId, config.apiUrl, config.apiKey));
      output.info(`🔗 Vizzly: View results at ${buildUrl}`);
    }

    // Wait for build completion if requested
    if (options.wait && result.buildId) {
      output.info('Waiting for build completion...');
      output.startSpinner('Processing comparisons...');

      let buildResult = await uploader.waitForBuild(result.buildId);

      output.success('Build processing completed');

      // Show build processing results
      if (buildResult.failedComparisons > 0) {
        output.warn(
          `${buildResult.failedComparisons} visual comparisons failed`
        );
      } else {
        output.success(
          `All ${buildResult.passedComparisons} visual comparisons passed`
        );
      }
      // Use API-provided URL or construct proper URL with org/project context
      let buildUrl =
        buildResult.url ||
        (await constructBuildUrl(result.buildId, config.apiUrl, config.apiKey));
      output.info(`🔗 Vizzly: View results at ${buildUrl}`);
    }

    output.cleanup();
  } catch (error) {
    // Mark build as failed if we have a buildId and config
    if (buildId && config) {
      try {
        let apiService = new ApiService({
          baseUrl: config.apiUrl,
          token: config.apiKey,
          command: 'upload',
        });
        let executionTime = Date.now() - uploadStartTime;
        await apiService.finalizeBuild(buildId, false, executionTime);
      } catch {
        // Silent fail on cleanup
      }
    }
    // Use user-friendly error message if available
    let errorMessage = error?.getUserMessage
      ? error.getUserMessage()
      : error.message;
    output.error(errorMessage || 'Upload failed', error);
    process.exit(1);
  }
}

/**
 * Validate upload options
 * @param {string} screenshotsPath - Path to screenshots
 * @param {Object} options - Command options
 */
export function validateUploadOptions(screenshotsPath, options) {
  let errors = [];

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
    let threshold = parseFloat(options.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
      errors.push('Threshold must be a number between 0 and 1');
    }
  }

  if (options.batchSize !== undefined) {
    let n = parseInt(options.batchSize, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Batch size must be a positive integer');
    }
  }

  if (options.uploadTimeout !== undefined) {
    let n = parseInt(options.uploadTimeout, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('Upload timeout must be a positive integer (milliseconds)');
    }
  }

  return errors;
}
