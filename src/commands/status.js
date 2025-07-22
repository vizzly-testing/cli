import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { container } from '../container/index.js';

/**
 * Status command implementation
 * @param {string} buildId - Build ID to check status for
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function statusCommand(buildId, options = {}, globalOptions = {}) {
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
    ui.info(`Checking status for build: ${buildId}`);

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

    // Get API service
    ui.startSpinner('Fetching build status...');
    const apiService = await container.get('apiService', config);

    // Get build status
    const buildStatus = await apiService.getBuildStatus(buildId);
    ui.stopSpinner();

    // Display results
    ui.success('Build status retrieved successfully');

    const statusData = {
      buildId: buildStatus.id,
      status: buildStatus.status,
      createdAt: buildStatus.createdAt,
      updatedAt: buildStatus.updatedAt,
      environment: buildStatus.environment,
      branch: buildStatus.branch,
      commit: buildStatus.commit,
      screenshotsTotal: buildStatus.screenshotsTotal || 0,
      comparisonsTotal: buildStatus.comparisonsTotal || 0,
      comparisonsCompleted: buildStatus.comparisonsCompleted || 0,
      comparisonsPassed: buildStatus.comparisonsPassed || 0,
      comparisonsFailed: buildStatus.comparisonsFailed || 0,
      url: buildStatus.url,
    };

    ui.data(statusData);

    // Show additional info in verbose mode
    if (globalOptions.verbose && buildStatus.screenshots) {
      ui.info('Screenshots included:', {
        count: buildStatus.screenshots.length,
        screenshots: buildStatus.screenshots.map(s => s.name),
      });
    }

    // Show progress if build is still processing
    if (
      buildStatus.status === 'processing' ||
      buildStatus.status === 'pending'
    ) {
      const progress =
        buildStatus.comparisonsCompleted / buildStatus.comparisonsTotal;
      if (!isNaN(progress)) {
        ui.info(`Progress: ${Math.round(progress * 100)}% complete`);
      }
    }

    ui.cleanup();

    // Exit with appropriate code based on build status
    if (buildStatus.status === 'failed' || buildStatus.comparisonsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    ui.error('Failed to get build status', error);
  }
}

/**
 * Validate status options
 * @param {string} buildId - Build ID to check
 * @param {Object} options - Command options
 */
export function validateStatusOptions(buildId) {
  const errors = [];

  if (!buildId || buildId.trim() === '') {
    errors.push('Build ID is required');
  }

  return errors;
}
