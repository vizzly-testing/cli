import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { createServices } from '../services/index.js';
import { getApiUrl } from '../utils/environment-config.js';

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

  // Note: ConsoleUI handles cleanup via global process listeners

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
    let services = createServices(config, 'status');
    let { apiService } = services;

    // Get build details via unified ApiService
    const buildStatus = await apiService.getBuild(buildId);
    ui.stopSpinner();

    // Extract build data from API response
    const build = buildStatus.build || buildStatus;

    // Display build summary
    ui.success(`Build: ${build.name || build.id}`);
    ui.info(`Status: ${build.status.toUpperCase()}`);
    ui.info(`Environment: ${build.environment}`);

    if (build.branch) {
      ui.info(`Branch: ${build.branch}`);
    }

    if (build.commit_sha) {
      ui.info(
        `Commit: ${build.commit_sha.substring(0, 8)} - ${build.commit_message || 'No message'}`
      );
    }

    // Show screenshot and comparison stats
    ui.info(`Screenshots: ${build.screenshot_count || 0} total`);
    ui.info(
      `Comparisons: ${build.total_comparisons || 0} total (${build.new_comparisons || 0} new, ${build.changed_comparisons || 0} changed, ${build.identical_comparisons || 0} identical)`
    );

    if (build.approval_status) {
      ui.info(`Approval Status: ${build.approval_status}`);
    }

    // Show timing information
    if (build.created_at) {
      ui.info(`Created: ${new Date(build.created_at).toLocaleString()}`);
    }

    if (build.completed_at) {
      ui.info(`Completed: ${new Date(build.completed_at).toLocaleString()}`);
    } else if (build.status !== 'completed' && build.status !== 'failed') {
      ui.info(
        `Started: ${new Date(build.started_at || build.created_at).toLocaleString()}`
      );
    }

    if (build.execution_time_ms) {
      ui.info(`Execution Time: ${Math.round(build.execution_time_ms / 1000)}s`);
    }

    // Show build URL if we can construct it
    const baseUrl = config.baseUrl || getApiUrl();
    if (baseUrl && build.project_id) {
      const buildUrl =
        baseUrl.replace('/api', '') +
        `/projects/${build.project_id}/builds/${build.id}`;
      ui.info(`View Build: ${buildUrl}`);
    }

    // Output JSON data for --json mode
    if (globalOptions.json) {
      const statusData = {
        buildId: build.id,
        status: build.status,
        name: build.name,
        createdAt: build.created_at,
        updatedAt: build.updated_at,
        completedAt: build.completed_at,
        environment: build.environment,
        branch: build.branch,
        commit: build.commit_sha,
        commitMessage: build.commit_message,
        screenshotsTotal: build.screenshot_count || 0,
        comparisonsTotal: build.total_comparisons || 0,
        newComparisons: build.new_comparisons || 0,
        changedComparisons: build.changed_comparisons || 0,
        identicalComparisons: build.identical_comparisons || 0,
        approvalStatus: build.approval_status,
        executionTime: build.execution_time_ms,
        isBaseline: build.is_baseline,
        userAgent: build.user_agent,
      };
      ui.data(statusData);
    }

    // Show additional info in verbose mode
    if (globalOptions.verbose) {
      ui.info('\n--- Additional Details ---');

      if (
        build.approved_screenshots > 0 ||
        build.rejected_screenshots > 0 ||
        build.pending_screenshots > 0
      ) {
        ui.info(
          `Screenshot Approvals: ${build.approved_screenshots || 0} approved, ${build.rejected_screenshots || 0} rejected, ${build.pending_screenshots || 0} pending`
        );
      }

      if (build.avg_diff_percentage !== null) {
        ui.info(
          `Average Diff: ${(build.avg_diff_percentage * 100).toFixed(2)}%`
        );
      }

      if (build.github_pull_request_number) {
        ui.info(`GitHub PR: #${build.github_pull_request_number}`);
      }

      if (build.is_baseline) {
        ui.info('This build is marked as a baseline');
      }

      ui.info(`User Agent: ${build.user_agent || 'Unknown'}`);
      ui.info(`Build ID: ${build.id}`);
      ui.info(`Project ID: ${build.project_id}`);
    }

    // Show progress if build is still processing
    if (build.status === 'processing' || build.status === 'pending') {
      const totalJobs =
        build.completed_jobs + build.failed_jobs + build.processing_screenshots;
      if (totalJobs > 0) {
        const progress = (build.completed_jobs + build.failed_jobs) / totalJobs;
        ui.info(`Progress: ${Math.round(progress * 100)}% complete`);
      }
    }

    ui.cleanup();

    // Exit with appropriate code based on build status
    if (build.status === 'failed' || build.failed_jobs > 0) {
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
