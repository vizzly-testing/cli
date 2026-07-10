/**
 * Status command implementation
 * Uses functional API operations directly
 */

import {
  createApiClient as defaultCreateApiClient,
  getBuild as defaultGetBuild,
  getPreviewInfo as defaultGetPreviewInfo,
} from '../api/index.js';
import { getAppBaseUrl } from '../utils/api-url.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../utils/environment-config.js';
import * as defaultOutput from '../utils/output.js';

function createStatusDeps(deps = {}) {
  return {
    loadConfig: deps.loadConfig || defaultLoadConfig,
    createApiClient: deps.createApiClient || defaultCreateApiClient,
    getBuild: deps.getBuild || defaultGetBuild,
    getPreviewInfo: deps.getPreviewInfo || defaultGetPreviewInfo,
    getApiUrl: deps.getApiUrl || defaultGetApiUrl,
    output: deps.output || defaultOutput,
    exit: deps.exit || (code => process.exit(code)),
  };
}

function configureOutput(output, globalOptions) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });
}

function createStatusClient({ createApiClient, config }) {
  return createApiClient({
    baseUrl: config.apiUrl,
    token: config.apiKey || config.userToken,
    command: 'status',
  });
}

function isMissingPreviewError(error) {
  return error.context?.status === 404;
}

async function fetchOptionalPreviewInfo(getPreviewInfo, client, buildId) {
  try {
    return await getPreviewInfo(client, buildId);
  } catch (error) {
    if (isMissingPreviewError(error)) {
      return null;
    }
    throw error;
  }
}

export function normalizeBuildStatus(buildStatus) {
  return buildStatus.build || buildStatus;
}

export function createStatusData(build, previewInfo = null) {
  let screenshotsTotal = build.screenshot_count || 0;
  let comparisonsTotal = build.total_comparisons || 0;
  let processingStats = build.processing_stats || {};
  let processingFailed =
    build.failed_jobs || processingStats.screenshots_failed || 0;
  let processingActive = build.processing_screenshots || 0;
  let processingPending = build.pending_screenshots || 0;
  let processingCompleted =
    build.completed_jobs || processingStats.screenshots_processed || 0;
  if (
    build.status === 'completed' &&
    processingActive === 0 &&
    processingPending === 0
  ) {
    processingCompleted = Math.max(screenshotsTotal - processingFailed, 0);
  }
  return {
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
    screenshotsTotal,
    processing: {
      completed: processingCompleted,
      failed: processingFailed,
      active: processingActive,
      pending: processingPending,
    },
    comparisonsTotal,
    screenshotsWithoutComparison: Math.max(
      screenshotsTotal - comparisonsTotal,
      0
    ),
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
}

export function createBuildInfo(build) {
  let buildInfo = {
    Name: build.name || build.id,
    Status: build.status.toUpperCase(),
    Environment: build.environment,
  };

  if (build.branch) {
    buildInfo.Branch = build.branch;
  }

  if (build.commit_sha) {
    let commitMessage = (build.commit_message || 'No message')
      .split('\n')[0]
      .trim();
    let conciseMessage =
      commitMessage.length > 80
        ? `${commitMessage.slice(0, 77)}...`
        : commitMessage;
    buildInfo.Commit = `${build.commit_sha.substring(0, 8)} - ${conciseMessage}`;
  }

  return buildInfo;
}

export function createComparisonStats(build, colors) {
  let stats = [];
  let newCount = build.new_comparisons || 0;
  let changedCount = build.changed_comparisons || 0;
  let identicalCount = build.identical_comparisons || 0;

  if (newCount > 0) {
    stats.push(`${colors.brand.info(newCount)} new`);
  }
  if (changedCount > 0) {
    stats.push(`${colors.brand.warning(changedCount)} changed`);
  }
  if (identicalCount > 0) {
    stats.push(`${colors.brand.success(identicalCount)} identical`);
  }

  return stats.join(colors.brand.textMuted(' · '));
}

export function createBuildUrl(baseUrl, build, linkedProject = null) {
  let organizationSlug =
    linkedProject?.organizationSlug || build.organization_slug;
  let projectSlug = linkedProject?.projectSlug || build.project_slug;
  if (!baseUrl || !organizationSlug || !projectSlug) {
    return null;
  }

  return `${getAppBaseUrl(baseUrl)}/${organizationSlug}/${projectSlug}/builds/${build.id}`;
}

export function shouldFailStatus(build) {
  return build.status === 'failed' || build.failed_jobs > 0;
}

export function getProcessingProgress(build) {
  if (build.status !== 'processing' && build.status !== 'pending') {
    return null;
  }

  let completedJobs = build.completed_jobs || 0;
  let failedJobs = build.failed_jobs || 0;
  let processingScreenshots = build.processing_screenshots || 0;
  let totalJobs = completedJobs + failedJobs + processingScreenshots;

  if (totalJobs <= 0) {
    return null;
  }

  return ((completedJobs + failedJobs) / totalJobs) * 100;
}

function writeStatusTiming({ build, output }) {
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
}

function createVerboseInfo(build) {
  let verboseInfo = {};

  if (
    build.approved_screenshots > 0 ||
    build.rejected_screenshots > 0 ||
    build.pending_screenshots > 0
  ) {
    verboseInfo.Approvals = `${build.approved_screenshots || 0} approved, ${build.rejected_screenshots || 0} rejected, ${build.pending_screenshots || 0} pending`;
  }

  if (build.avg_diff_percentage != null) {
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

  return verboseInfo;
}

function writeHumanStatus({
  build,
  buildUrl,
  globalOptions,
  output,
  previewInfo,
}) {
  output.header('status', build.status);
  output.keyValue(createBuildInfo(build));
  output.blank();

  let colors = output.getColors();
  let comparisonStats = createComparisonStats(build, colors);

  output.labelValue('Screenshots', String(build.screenshot_count || 0));

  if (
    build.completed_jobs != null ||
    build.failed_jobs != null ||
    build.processing_screenshots != null
  ) {
    output.labelValue(
      'Processing',
      `${build.completed_jobs || 0} completed · ${build.failed_jobs || 0} failed · ${build.processing_screenshots || 0} active`
    );
  }

  if (comparisonStats) {
    output.labelValue('Comparisons', comparisonStats);
  }

  let screenshotsWithoutComparison = Math.max(
    (build.screenshot_count || 0) - (build.total_comparisons || 0),
    0
  );
  if (screenshotsWithoutComparison > 0) {
    output.labelValue(
      'Uncompared',
      `${screenshotsWithoutComparison} screenshots`
    );
  }

  if (build.approval_status) {
    output.labelValue('Review', build.approval_status);
  }

  output.blank();
  writeStatusTiming({ build, output });

  if (buildUrl) {
    output.blank();
    output.labelValue('View', output.link('Build', buildUrl));
  }

  if (previewInfo?.preview_url) {
    output.labelValue(
      'Preview',
      output.link('Preview', previewInfo.preview_url)
    );
    if (previewInfo.expires_at) {
      let expiresDate = new Date(previewInfo.expires_at);
      output.hint(`Preview expires ${expiresDate.toLocaleDateString()}`);
    }
  }

  if (globalOptions.verbose) {
    output.blank();
    output.divider();
    output.blank();
    output.keyValue(createVerboseInfo(build));
  }

  let progress = getProcessingProgress(build);
  if (progress !== null) {
    output.blank();
    output.print(
      `  ${output.progressBar(progress, 100)} ${Math.round(progress)}%`
    );
  }
}

/**
 * Status command implementation
 * @param {string} buildId - Build ID to check status for
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function statusCommand(
  buildId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig,
    createApiClient,
    getBuild,
    getPreviewInfo,
    getApiUrl,
    output,
    exit,
  } = createStatusDeps(deps);

  configureOutput(output, globalOptions);

  try {
    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    let token = config.apiKey || config.userToken;
    if (!token) {
      output.error(
        'Authentication required. Use --token, set VIZZLY_TOKEN, or run "vizzly login"'
      );
      output.cleanup();
      exit(1);
      return { success: false, result: { reason: 'missing_token' } };
    }

    // Get build details via functional API
    output.startSpinner('Fetching build status...');
    let client = createStatusClient({ createApiClient, config });
    let buildStatus = await getBuild(client, buildId);

    // Also fetch preview info (if exists)
    let previewInfo = await fetchOptionalPreviewInfo(
      getPreviewInfo,
      client,
      buildId
    );
    output.stopSpinner();

    // Extract build data from API response
    let build = normalizeBuildStatus(buildStatus);

    // Output in JSON mode
    if (globalOptions.json) {
      output.data(createStatusData(build, previewInfo));
      output.cleanup();
      return;
    }

    // Human-readable output
    // Show build URL if we can construct it
    let baseUrl = config.baseUrl || getApiUrl();
    let buildUrl = createBuildUrl(baseUrl, build, config.linkedProject);
    writeHumanStatus({ build, buildUrl, globalOptions, output, previewInfo });

    output.cleanup();

    // Exit with appropriate code based on build status
    if (shouldFailStatus(build)) {
      exit(1);
    }
  } catch (error) {
    output.stopSpinner();

    // Don't fail CI for Vizzly infrastructure issues (5xx errors)
    let status = error.context?.status;
    if (status >= 500) {
      output.warn('Vizzly API unavailable - status check skipped.');
      output.cleanup();
      return { success: true, result: { skipped: true } };
    }

    output.error('Failed to get build status', error);
    output.cleanup();
    exit(1);
    return { success: false, error };
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
