import {
  createApiClient as defaultCreateApiClient,
  finalizeBuild as defaultFinalizeBuild,
  getTokenContext as defaultGetTokenContext,
} from '../api/index.js';
import { createUploader as defaultCreateUploader } from '../services/uploader.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import {
  detectBranch as defaultDetectBranch,
  detectCommit as defaultDetectCommit,
  detectCommitMessage as defaultDetectCommitMessage,
  detectPullRequestNumber as defaultDetectPullRequestNumber,
  generateBuildNameWithGit as defaultGenerateBuildNameWithGit,
} from '../utils/git.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Construct proper build URL with org/project context
 * @param {string} buildId - Build ID
 * @param {string} apiUrl - API base URL
 * @param {string} apiToken - API token
 * @param {Object} deps - Dependencies
 * @returns {Promise<string>} Proper build URL
 */
export async function constructBuildUrl(buildId, apiUrl, apiToken, deps = {}) {
  let {
    createApiClient = defaultCreateApiClient,
    getTokenContext = defaultGetTokenContext,
    output = defaultOutput,
  } = deps;

  try {
    let client = createApiClient({
      baseUrl: apiUrl,
      token: apiToken,
      command: 'upload',
    });

    let tokenContext = await getTokenContext(client);
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
 * @param {Object} deps - Dependencies for testing
 */
export async function uploadCommand(
  screenshotsPath,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    finalizeBuild = defaultFinalizeBuild,
    createUploader = defaultCreateUploader,
    detectBranch = defaultDetectBranch,
    detectCommit = defaultDetectCommit,
    detectCommitMessage = defaultDetectCommitMessage,
    detectPullRequestNumber = defaultDetectPullRequestNumber,
    generateBuildNameWithGit = defaultGenerateBuildNameWithGit,
    output = defaultOutput,
    exit = code => process.exit(code),
    buildUrlConstructor = constructBuildUrl,
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let buildId = null;
  let config = null;
  const uploadStartTime = Date.now();

  try {
    output.info('Starting upload process...');

    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      exit(1);
      return { success: false, reason: 'no-api-key' };
    }

    // Collect git metadata if not provided
    const branch = await detectBranch(options.branch);
    const commit = await detectCommit(options.commit);
    const message = options.message || (await detectCommitMessage());
    const buildName = await generateBuildNameWithGit(options.buildName);
    const pullRequestNumber = detectPullRequestNumber();

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

    // Create uploader
    output.startSpinner('Initializing uploader...');
    let uploader = createUploader({ ...config, command: 'upload' });

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
      pullRequestNumber,
      parallelId: config.parallelId,
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

        output.progress(displayMessage || 'Processing...', current, total);
      },
    };

    // Start upload
    output.progress('Starting upload...');
    const result = await uploader.upload(uploadOptions);
    buildId = result.buildId; // Ensure we have the buildId

    // Mark build as completed
    if (result.buildId) {
      output.progress('Finalizing build...');
      try {
        let client = createApiClient({
          baseUrl: config.apiUrl,
          token: config.apiKey,
          command: 'upload',
        });
        let executionTime = Date.now() - uploadStartTime;
        await finalizeBuild(client, result.buildId, true, executionTime);
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
        (await buildUrlConstructor(
          result.buildId,
          config.apiUrl,
          config.apiKey,
          deps
        ));
      output.info(`🔗 Vizzly: View results at ${buildUrl}`);
    }

    // Wait for build completion if requested
    if (options.wait && result.buildId) {
      output.info('Waiting for build completion...');
      output.startSpinner('Processing comparisons...');

      const buildResult = await uploader.waitForBuild(result.buildId);

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
      let waitBuildUrl =
        buildResult.url ||
        (await buildUrlConstructor(
          result.buildId,
          config.apiUrl,
          config.apiKey,
          deps
        ));
      output.info(`🔗 Vizzly: View results at ${waitBuildUrl}`);
    }

    output.cleanup();
    return { success: true, result };
  } catch (error) {
    // Mark build as failed if we have a buildId and config
    if (buildId && config) {
      try {
        let client = createApiClient({
          baseUrl: config.apiUrl,
          token: config.apiKey,
          command: 'upload',
        });
        let executionTime = Date.now() - uploadStartTime;
        await finalizeBuild(client, buildId, false, executionTime);
      } catch {
        // Silent fail on cleanup
      }
    }
    // Use user-friendly error message if available
    let errorMessage = error?.getUserMessage
      ? error.getUserMessage()
      : error.message;
    output.error(errorMessage || 'Upload failed', error);
    exit(1);
    return { success: false, error };
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
    if (Number.isNaN(threshold) || threshold < 0) {
      errors.push(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
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
