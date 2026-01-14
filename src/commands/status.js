/**
 * Status command implementation
 * Uses functional API operations directly
 */

import { createApiClient, getBuild, getPreviewInfo } from '../api/index.js';
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
    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      process.exit(1);
    }

    // Get build details via functional API
    output.startSpinner('Fetching build status...');
    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'status',
    });
    let buildStatus = await getBuild(client, buildId);

    // Also fetch preview info (if exists)
    let previewInfo = await getPreviewInfo(client, buildId);
    output.stopSpinner();

    // Extract build data from API response
    let build = buildStatus.build || buildStatus;

    // Output in JSON mode
    if (globalOptions.json) {
      let statusData = {
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
        preview: previewInfo
          ? {
              url: previewInfo.preview_url,
              status: previewInfo.status,
              fileCount: previewInfo.file_count,
              expiresAt: previewInfo.expires_at,
            }
          : null,
      };
      output.data(statusData);
      output.cleanup();
      return;
    }

    // Human-readable output
    output.header('status', build.status);

    // Build info section
    let buildInfo = {
      Name: build.name || build.id,
      Status: build.status.toUpperCase(),
      Environment: build.environment,
    };

    if (build.branch) {
      buildInfo.Branch = build.branch;
    }

    if (build.commit_sha) {
      buildInfo.Commit = `${build.commit_sha.substring(0, 8)} - ${build.commit_message || 'No message'}`;
    }

    output.keyValue(buildInfo);
    output.blank();

    // Comparison stats with visual indicators
    let colors = output.getColors();
    let stats = [];
    let newCount = build.new_comparisons || 0;
    let changedCount = build.changed_comparisons || 0;
    let identicalCount = build.identical_comparisons || 0;
    let screenshotCount = build.screenshot_count || 0;

    output.labelValue('Screenshots', String(screenshotCount));

    if (newCount > 0) {
      stats.push(`${colors.brand.info(newCount)} new`);
    }
    if (changedCount > 0) {
      stats.push(`${colors.brand.warning(changedCount)} changed`);
    }
    if (identicalCount > 0) {
      stats.push(`${colors.brand.success(identicalCount)} identical`);
    }

    if (stats.length > 0) {
      output.labelValue(
        'Comparisons',
        stats.join(colors.brand.textMuted(' · '))
      );
    }

    if (build.approval_status) {
      output.labelValue('Approval', build.approval_status);
    }

    output.blank();

    // Timing info
    if (build.created_at) {
      output.hint(`Created ${new Date(build.created_at).toLocaleString()}`);
    }

    if (build.completed_at) {
      output.hint(`Completed ${new Date(build.completed_at).toLocaleString()}`);
    } else if (build.status !== 'completed' && build.status !== 'failed') {
      output.hint(
        `Started ${new Date(build.started_at || build.created_at).toLocaleString()}`
      );
    }

    if (build.execution_time_ms) {
      output.hint(`Took ${Math.round(build.execution_time_ms / 1000)}s`);
    }

    // Show build URL if we can construct it
    let baseUrl = config.baseUrl || getApiUrl();
    if (baseUrl && build.project_id) {
      let buildUrl =
        baseUrl.replace('/api', '') +
        `/projects/${build.project_id}/builds/${build.id}`;
      output.blank();
      output.labelValue('View', output.link('Build', buildUrl));
    }

    // Show preview URL if available
    if (previewInfo?.preview_url) {
      output.labelValue('Preview', output.link('Preview', previewInfo.preview_url));
      if (previewInfo.expires_at) {
        let expiresDate = new Date(previewInfo.expires_at);
        output.hint(`Preview expires ${expiresDate.toLocaleDateString()}`);
      }
    }

    // Show additional info in verbose mode
    if (globalOptions.verbose) {
      output.blank();
      output.divider();
      output.blank();

      let verboseInfo = {};

      if (
        build.approved_screenshots > 0 ||
        build.rejected_screenshots > 0 ||
        build.pending_screenshots > 0
      ) {
        verboseInfo.Approvals = `${build.approved_screenshots || 0} approved, ${build.rejected_screenshots || 0} rejected, ${build.pending_screenshots || 0} pending`;
      }

      if (build.avg_diff_percentage !== null) {
        verboseInfo['Avg Diff'] =
          `${(build.avg_diff_percentage * 100).toFixed(2)}%`;
      }

      if (build.github_pull_request_number) {
        verboseInfo['GitHub PR'] = `#${build.github_pull_request_number}`;
      }

      if (build.is_baseline) {
        verboseInfo.Baseline = 'Yes';
      }

      verboseInfo['User Agent'] = build.user_agent || 'Unknown';
      verboseInfo['Build ID'] = build.id;
      verboseInfo['Project ID'] = build.project_id;

      output.keyValue(verboseInfo);
    }

    // Show progress if build is still processing
    if (build.status === 'processing' || build.status === 'pending') {
      let totalJobs =
        build.completed_jobs + build.failed_jobs + build.processing_screenshots;
      if (totalJobs > 0) {
        let progress = (build.completed_jobs + build.failed_jobs) / totalJobs;
        output.blank();
        output.print(
          `  ${output.progressBar(progress * 100, 100)} ${Math.round(progress * 100)}%`
        );
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
  let errors = [];

  if (!buildId || buildId.trim() === '') {
    errors.push('Build ID is required');
  }

  return errors;
}
