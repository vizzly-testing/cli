import { createServices } from '../services/index.js';
import { loadConfig } from '../utils/config-loader.js';
import { getApiUrl } from '../utils/environment-config.js';
import * as output from '../utils/output.js';

/**
 * Status command implementation
 * @param {string} buildId - Build ID to check status for
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function statusCommand(buildId, options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    output.info(`Checking status for build: ${buildId}`);

    // Load configuration with CLI overrides
    const allOptions = { ...globalOptions, ...options };
    const config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      process.exit(1);
    }

    // Get API service
    output.startSpinner('Fetching build status...');
    const services = createServices(config, 'status');
    const { apiService } = services;

    // Get build details via unified ApiService
    const buildStatus = await apiService.getBuild(buildId);
    output.stopSpinner();

    // Extract build data from API response
    const build = buildStatus.build || buildStatus;

    // Display build summary
    output.success(`Build: ${build.name || build.id}`);
    output.info(`Status: ${build.status.toUpperCase()}`);
    output.info(`Environment: ${build.environment}`);

    if (build.branch) {
      output.info(`Branch: ${build.branch}`);
    }

    if (build.commit_sha) {
      output.info(
        `Commit: ${build.commit_sha.substring(0, 8)} - ${build.commit_message || 'No message'}`
      );
    }

    // Show screenshot and comparison stats
    output.info(`Screenshots: ${build.screenshot_count || 0} total`);
    output.info(
      `Comparisons: ${build.total_comparisons || 0} total (${build.new_comparisons || 0} new, ${build.changed_comparisons || 0} changed, ${build.identical_comparisons || 0} identical)`
    );

    if (build.approval_status) {
      output.info(`Approval Status: ${build.approval_status}`);
    }

    // Show timing information
    if (build.created_at) {
      output.info(`Created: ${new Date(build.created_at).toLocaleString()}`);
    }

    if (build.completed_at) {
      output.info(
        `Completed: ${new Date(build.completed_at).toLocaleString()}`
      );
    } else if (build.status !== 'completed' && build.status !== 'failed') {
      output.info(
        `Started: ${new Date(build.started_at || build.created_at).toLocaleString()}`
      );
    }

    if (build.execution_time_ms) {
      output.info(
        `Execution Time: ${Math.round(build.execution_time_ms / 1000)}s`
      );
    }

    // Show build URL if we can construct it
    const baseUrl = config.baseUrl || getApiUrl();
    if (baseUrl && build.project_id) {
      const buildUrl =
        baseUrl.replace('/api', '') +
        `/projects/${build.project_id}/builds/${build.id}`;
      output.info(`View Build: ${buildUrl}`);
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
      output.data(statusData);
    }

    // Show additional info in verbose mode
    if (globalOptions.verbose) {
      output.info('\n--- Additional Details ---');

      if (
        build.approved_screenshots > 0 ||
        build.rejected_screenshots > 0 ||
        build.pending_screenshots > 0
      ) {
        output.info(
          `Screenshot Approvals: ${build.approved_screenshots || 0} approved, ${build.rejected_screenshots || 0} rejected, ${build.pending_screenshots || 0} pending`
        );
      }

      if (build.avg_diff_percentage !== null) {
        output.info(
          `Average Diff: ${(build.avg_diff_percentage * 100).toFixed(2)}%`
        );
      }

      if (build.github_pull_request_number) {
        output.info(`GitHub PR: #${build.github_pull_request_number}`);
      }

      if (build.is_baseline) {
        output.info('This build is marked as a baseline');
      }

      output.info(`User Agent: ${build.user_agent || 'Unknown'}`);
      output.info(`Build ID: ${build.id}`);
      output.info(`Project ID: ${build.project_id}`);
    }

    // Show progress if build is still processing
    if (build.status === 'processing' || build.status === 'pending') {
      const totalJobs =
        build.completed_jobs + build.failed_jobs + build.processing_screenshots;
      if (totalJobs > 0) {
        const progress = (build.completed_jobs + build.failed_jobs) / totalJobs;
        output.info(`Progress: ${Math.round(progress * 100)}% complete`);
      }
    }

    output.cleanup();

    // Exit with appropriate code based on build status
    if (build.status === 'failed' || build.failed_jobs > 0) {
      process.exit(1);
    }
  } catch (error) {
    output.error('Failed to get build status', error);
    process.exit(1);
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
