import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { createServiceContainer } from '../container/index.js';
import { detectBranch, detectCommit, getCommitMessage } from '../utils/git.js';

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

  // Ensure cleanup on exit
  process.on('SIGINT', () => ui.cleanup());
  process.on('exit', () => ui.cleanup());

  try {
    ui.info('Starting upload process...');

    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    const config = await loadConfig(globalOptions.config, allOptions);

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
    const message = options.message || (await getCommitMessage());

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

    // Set up progress tracking
    uploader.on('progress', progressData => {
      const { message: progressMessage, current, total, phase } = progressData;
      ui.progress(
        progressMessage ||
          `${phase || 'Processing'}: ${current || 0}/${total || 0}`,
        current,
        total
      );
    });

    uploader.on('error', error => {
      ui.error('Upload error occurred', error);
    });

    // Prepare upload options
    const uploadOptions = {
      buildName: config.build.name,
      branch,
      commit,
      message,
      environment: config.build.environment,
      threshold: config.comparison.threshold,
      metadata: options.metadata ? JSON.parse(options.metadata) : {},
    };

    // Start upload
    ui.progress('Starting upload...');
    const result = await uploader.upload(screenshotsPath, uploadOptions);

    ui.success('Upload completed successfully');
    ui.data({
      buildId: result.buildId,
      screenshotsUploaded: result.screenshotsUploaded,
      comparisons: result.comparisons,
      url: result.url,
    });

    // Wait for build completion if requested
    if (options.wait && result.buildId) {
      ui.info('Waiting for build completion...');
      ui.startSpinner('Processing comparisons...');

      const buildResult = await uploader.waitForBuild(result.buildId);

      ui.success('Build processing completed');
      ui.data({
        status: buildResult.status,
        comparisons: buildResult.comparisons,
        passedComparisons: buildResult.passedComparisons,
        failedComparisons: buildResult.failedComparisons,
        url: buildResult.url,
      });
    }

    ui.cleanup();
  } catch (error) {
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

  return errors;
}
