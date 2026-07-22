/**
 * Status command implementation
 * Uses functional API operations directly
 */

import {
  createApiClient as defaultCreateApiClient,
  getBuildStatus as defaultGetBuildStatus,
  getPreviewInfo as defaultGetPreviewInfo,
} from '../api/index.js';
import { getAppBaseUrl } from '../utils/api-url.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';
import { getVisualReviewState } from '../utils/visual-context-normalizers.js';

function createStatusDeps(deps = {}) {
  return {
    loadConfig: deps.loadConfig || defaultLoadConfig,
    createApiClient: deps.createApiClient || defaultCreateApiClient,
    getBuildStatus: deps.getBuildStatus || defaultGetBuildStatus,
    getPreviewInfo: deps.getPreviewInfo || defaultGetPreviewInfo,
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

/**
 * Read exact processing counts from canonical or legacy status responses.
 *
 * Legacy `pending_screenshots` is review state, not queue state, so it is
 * deliberately excluded. Missing processing fields remain missing instead of
 * becoming client-authored zeroes.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @returns {Object|undefined} API-provided processing facts when available.
 */
export function getProcessingStatus(status = {}) {
  if (status.processing) {
    return status.processing;
  }

  let build = normalizeBuildStatus(status);
  let processing = {};
  let fields = [
    ['total', build.screenshot_count],
    ['completed', build.completed_jobs],
    ['failed', build.failed_jobs],
    ['active', build.processing_screenshots],
  ];

  for (let [name, value] of fields) {
    if (value != null) {
      processing[name] = value;
    }
  }

  return Object.keys(processing).length > 0 ? processing : undefined;
}

/**
 * Read comparison totals without deriving them from screenshot counts.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @returns {Object|undefined} API-provided comparison facts when available.
 */
export function getComparisonStatus(status = {}) {
  if (status.comparisons) {
    return status.comparisons;
  }

  let build = normalizeBuildStatus(status);
  let comparisons = {};
  let fields = [
    ['total', build.total_comparisons],
    ['new', build.new_comparisons],
    ['changed', build.changed_comparisons],
    ['identical', build.identical_comparisons],
  ];

  for (let [name, value] of fields) {
    if (value != null) {
      comparisons[name] = value;
    }
  }

  return Object.keys(comparisons).length > 0 ? comparisons : undefined;
}

/**
 * Prefer canonical Cricket review state while retaining the legacy fallback.
 *
 * Processing status stays separate: a pending review never means a screenshot
 * is still being processed.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @returns {string|null} API-provided review state when available.
 */
export function getBuildReviewState(status = {}) {
  let build = normalizeBuildStatus(status);
  return (
    getVisualReviewState(build) ||
    getVisualReviewState(status.visualReview?.build || status.visual_review) ||
    null
  );
}

/**
 * Give agents concrete paths from lifecycle status into visual evidence.
 *
 * @param {Object} build - Build record from the status response.
 * @returns {{label: string, command: string}[]} Executable CLI commands.
 */
export function createStatusSuggestedCommands(build = {}) {
  if (!build.id) {
    return [];
  }

  return [
    {
      label: 'Inspect build context',
      command: `vizzly --json context build ${build.id} --agent`,
    },
    {
      label: 'List comparisons',
      command: `vizzly --json comparisons --build ${build.id}`,
    },
  ];
}

/**
 * Preserve the established JSON fields while exposing canonical status facts.
 *
 * Every lifecycle, processing, comparison, and review value comes directly
 * from the API. Undefined values intentionally disappear during JSON encoding
 * rather than being presented as false certainty.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @param {Object|null} previewInfo - Optional preview response.
 * @returns {Object} Machine-readable status payload.
 */
export function createStatusData(status, previewInfo = null) {
  let build = normalizeBuildStatus(status);
  let processing = getProcessingStatus(status);
  let comparisons = getComparisonStatus(status);
  let visualReview =
    build.visual_review || status.visualReview?.build || status.visual_review;

  return {
    resource: status.resource,
    schemaVersion: status.schema_version,
    buildId: build.id,
    status: build.status,
    conclusion: status.conclusion,
    name: build.name,
    createdAt: build.created_at,
    updatedAt: build.updated_at,
    completedAt: build.completed_at,
    environment: build.environment,
    branch: build.branch,
    commit: build.commit_sha,
    commitMessage: build.commit_message,
    screenshotsTotal: processing?.total ?? build.screenshot_count,
    processing,
    comparisonsTotal: comparisons?.total ?? build.total_comparisons,
    comparisons,
    newComparisons: comparisons?.new ?? build.new_comparisons,
    changedComparisons: comparisons?.changed ?? build.changed_comparisons,
    identicalComparisons: comparisons?.identical ?? build.identical_comparisons,
    reviewState: getBuildReviewState(status),
    review: status.review,
    reviewFlow: status.reviewFlow,
    visualReview,
    approvalStatus: build.approval_status,
    executionTime: build.execution_time_ms,
    isBaseline: build.is_baseline,
    userAgent: build.user_agent,
    scope: status.scope,
    links: status.links,
    suggestedCommands: createStatusSuggestedCommands(build),
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
    buildInfo.Commit = `${build.commit_sha.substring(0, 8)} - ${build.commit_message || 'No message'}`;
  }

  return buildInfo;
}

/**
 * Format API comparison outcomes without filling missing buckets with zeroes.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @param {Object} colors - Output color helpers.
 * @returns {string} Human-readable comparison summary.
 */
export function createComparisonStats(status, colors) {
  let build = normalizeBuildStatus(status);
  let comparisons = getComparisonStatus(status) || {};
  let stats = [];
  let newCount = comparisons.new ?? build.new_comparisons;
  let changedCount = comparisons.changed ?? build.changed_comparisons;
  let identicalCount = comparisons.identical ?? build.identical_comparisons;

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

/**
 * Build the best available legacy link when the API did not return one.
 *
 * Slug routes match the current app, while the project-ID route remains as a
 * compatibility fallback for older build responses.
 *
 * @param {string} baseUrl - API or app base URL.
 * @param {Object} build - Build record.
 * @param {Object|null} scope - Canonical organization and project scope.
 * @returns {string|null} Build URL when the response has enough identity.
 */
export function createBuildUrl(baseUrl, build, scope = null) {
  if (!baseUrl) {
    return null;
  }

  let organizationSlug =
    scope?.organization?.slug || build.organization_slug || build.org_slug;
  let projectSlug = scope?.project?.slug || build.project_slug;
  let appBaseUrl = getAppBaseUrl(baseUrl);

  if (organizationSlug && projectSlug) {
    return `${appBaseUrl}/${organizationSlug}/${projectSlug}/builds/${build.id}`;
  }

  if (build.project_id) {
    return `${appBaseUrl}/projects/${build.project_id}/builds/${build.id}`;
  }

  return null;
}

/**
 * Preserve status failure behavior while accepting the canonical conclusion.
 *
 * Review-required and rejected builds keep their existing successful command
 * exit behavior. Only build or processing failures produce a failing status.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @returns {boolean} Whether human status should exit non-zero.
 */
export function shouldFailStatus(status) {
  let build = normalizeBuildStatus(status);
  let processing = getProcessingStatus(status);
  return (
    build.status === 'failed' ||
    ['build_failed', 'processing_failed'].includes(status.conclusion) ||
    (processing?.failed ?? 0) > 0
  );
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

/**
 * Render follow-up commands after the factual status summary.
 *
 * Status answers lifecycle questions; these commands are the explicit bridge
 * to screenshot evidence without bloating the status response itself.
 *
 * @param {Object} build - Build record from the status response.
 * @param {Object} output - Configured output boundary.
 */
function writeSuggestedCommands({ build, output }) {
  let commands = createStatusSuggestedCommands(build);
  if (commands.length === 0) {
    return;
  }

  let colors = output.getColors();
  output.blank();
  output.print('  Suggested commands');

  for (let item of commands) {
    output.print(`    ${colors.brand.textMuted(item.command)}`);
  }
}

/**
 * Add optional API facts without inventing placeholders for missing metadata.
 *
 * @param {Object} status - Canonical status bundle or legacy build record.
 * @returns {Object} Available verbose fields.
 */
function createVerboseInfo(status) {
  let build = normalizeBuildStatus(status);
  let verboseInfo = {};

  if (status.review) {
    let reviewParts = [
      ['approved', status.review.approved],
      ['rejected', status.review.rejected],
      ['pending', status.review.pending],
    ]
      .filter(([, value]) => value != null)
      .map(([label, value]) => `${value} ${label}`);
    if (reviewParts.length > 0) {
      verboseInfo.Review = reviewParts.join(', ');
    }
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

  if (build.user_agent) {
    verboseInfo['User Agent'] = build.user_agent;
  }
  verboseInfo['Build ID'] = build.id;
  if (status.scope?.project?.id || build.project_id) {
    verboseInfo['Project ID'] = status.scope?.project?.id || build.project_id;
  }

  return verboseInfo;
}

/**
 * Format only the processing facts supplied by the API.
 *
 * @param {Object|undefined} processing - Canonical processing counts.
 * @returns {string} Human-readable processing summary.
 */
function formatProcessingStatus(processing) {
  if (!processing) {
    return '';
  }

  let labels = {
    total: 'total',
    completed: 'completed',
    failed: 'failed',
    active: 'active',
    pending: 'pending',
  };

  return Object.entries(labels)
    .filter(([field]) => processing[field] != null)
    .map(([field, label]) => `${processing[field]} ${label}`)
    .join(' · ');
}

/**
 * Present lifecycle, processing, comparisons, and review as separate facts.
 *
 * Keeping these lanes separate prevents review-pending counts from looking
 * like unfinished processing and keeps the human view aligned with JSON.
 *
 * @param {Object} options - Human status presentation inputs.
 */
function writeHumanStatus({
  build,
  buildUrl,
  globalOptions,
  output,
  previewInfo,
  status,
}) {
  output.header('status', build.status);
  output.keyValue(createBuildInfo(build));
  output.blank();

  let colors = output.getColors();
  let comparisonStats = createComparisonStats(status, colors);
  let processing = getProcessingStatus(status);
  let screenshotsTotal = processing?.total ?? build.screenshot_count;
  let processingSummary = formatProcessingStatus(processing);

  if (screenshotsTotal != null) {
    output.labelValue('Screenshots', String(screenshotsTotal));
  }

  if (processingSummary) {
    output.labelValue('Processing', processingSummary);
  }

  if (comparisonStats) {
    output.labelValue('Comparisons', comparisonStats);
  }

  let reviewState = getBuildReviewState(status);
  if (reviewState) {
    output.labelValue('Review', reviewState);
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
    output.keyValue(createVerboseInfo(status));
  }

  writeSuggestedCommands({ build, output });
}

/**
 * Fetch and present the server-owned build status contract.
 *
 * Preview remains an optional adjacent resource, and established 5xx and
 * build-failure exit semantics remain unchanged.
 *
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
    getBuildStatus,
    getPreviewInfo,
    output,
    exit,
  } = createStatusDeps(deps);

  configureOutput(output, globalOptions);

  try {
    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey && !config.userToken) {
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
    let buildStatus = await getBuildStatus(client, buildId);

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
      output.data(createStatusData(buildStatus, previewInfo));
      output.cleanup();
      return;
    }

    // Human-readable output
    // Show build URL if we can construct it
    let buildUrl =
      buildStatus.links?.web ||
      createBuildUrl(config.apiUrl, build, buildStatus.scope);
    writeHumanStatus({
      build,
      buildUrl,
      globalOptions,
      output,
      previewInfo,
      status: buildStatus,
    });

    output.cleanup();

    // Exit with appropriate code based on build status
    if (shouldFailStatus(buildStatus)) {
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
