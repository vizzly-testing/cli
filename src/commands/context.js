/**
 * Context commands - fetch visual context bundles for agents and reviewers
 */

import {
  createApiClient as defaultCreateApiClient,
  getBuildContext as defaultGetBuildContext,
  getComparisonContext as defaultGetComparisonContext,
  getReviewQueueContext as defaultGetReviewQueueContext,
  getScreenshotContext as defaultGetScreenshotContext,
  getSimilarFingerprintContext as defaultGetSimilarFingerprintContext,
} from '../api/index.js';
import { createLocalWorkspaceContextProvider as defaultCreateLocalWorkspaceContextProvider } from '../context/local-workspace-provider.js';
import { resolveContextSource as defaultResolveContextSource } from '../context/provider-resolver.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';
import { readSession as defaultReadSession } from '../utils/session.js';
import { normalizeBuildContext } from '../utils/visual-context-normalizers.js';

function buildAuthErrorMessage() {
  return 'Authentication required. Use --token, set VIZZLY_TOKEN, run "vizzly login", or link a project.';
}

function buildSourceErrorMessage() {
  return '--source must be one of: auto, cloud, local';
}

function buildIncludeErrorMessage() {
  return '--include must contain only: screenshots, diffs, comments';
}

function validateLimitRange(value, flagName, { min = 1, max }) {
  if (value == null) {
    return [];
  }

  if (!Number.isInteger(value) || value < min || value > max) {
    return [`${flagName} must be an integer between ${min} and ${max}`];
  }

  return [];
}

function validateOffset(value) {
  if (value == null) {
    return [];
  }

  if (!Number.isInteger(value) || value < 0) {
    return ['--offset must be a non-negative integer'];
  }

  return [];
}

function validateSourceOption(value) {
  if (value == null) {
    return [];
  }

  if (!['auto', 'cloud', 'local'].includes(value)) {
    return [buildSourceErrorMessage()];
  }

  return [];
}

function parseIncludeOption(value) {
  if (!value) {
    return [];
  }

  let rawItems = Array.isArray(value) ? value : String(value).split(',');
  return rawItems.map(item => item.trim()).filter(Boolean);
}

function validateIncludeOption(value) {
  let allowed = new Set(['screenshots', 'diffs', 'comments']);
  let invalid = parseIncludeOption(value).filter(item => !allowed.has(item));

  return invalid.length > 0 ? [buildIncludeErrorMessage()] : [];
}

function validateScopedProjectOptions(options = {}) {
  let errors = [];

  if (options.org && !options.project) {
    errors.push('--org requires --project');
  }

  return errors;
}

function hasExplicitCloudScope(options = {}, config = {}) {
  return Boolean(
    options.org ||
      options.project ||
      config.linkedProject?.organizationSlug ||
      config.linkedProject?.projectSlug
  );
}

function createClient(config, createApiClient) {
  return createApiClient({
    baseUrl: config.apiUrl,
    token: config.apiKey || config.userToken,
    command: 'context',
  });
}

async function loadContextConfig(globalOptions, options, deps) {
  let {
    loadConfig = defaultLoadConfig,
    requireApiKey = true,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  let allOptions = { ...globalOptions, ...options };
  let config = await loadConfig(globalOptions.config, allOptions);

  if (requireApiKey && !config.apiKey && !config.userToken) {
    output.error(buildAuthErrorMessage());
    output.cleanup();
    exit(1);
    return null;
  }

  return config;
}

function createCloudContextProvider(config, deps = {}) {
  let {
    createApiClient = defaultCreateApiClient,
    getBuildContext = defaultGetBuildContext,
    getComparisonContext = defaultGetComparisonContext,
    getScreenshotContext = defaultGetScreenshotContext,
    getSimilarFingerprintContext = defaultGetSimilarFingerprintContext,
    getReviewQueueContext = defaultGetReviewQueueContext,
  } = deps;
  let client = createClient(config, createApiClient);

  return {
    source: 'cloud',
    async getBuildContext(buildId, query) {
      return await getBuildContext(client, buildId, query);
    },
    async getComparisonContext(comparisonId, query) {
      return await getComparisonContext(client, comparisonId, query);
    },
    async getScreenshotContext(screenshotName, query) {
      return await getScreenshotContext(client, screenshotName, query);
    },
    async getSimilarFingerprintContext(fingerprintHash, query) {
      return await getSimilarFingerprintContext(client, fingerprintHash, query);
    },
    async getReviewQueueContext(query) {
      return await getReviewQueueContext(client, query);
    },
  };
}

function buildLocalFingerprintCapabilityError() {
  let error = new Error(
    'Local workspace context does not support fingerprint similarity yet. Use --source cloud for this query.'
  );
  error.code = 'LOCAL_WORKSPACE_CONTEXT';
  return error;
}

function resolveBuildContextId(buildId, runtime, deps = {}) {
  let { readSession = defaultReadSession } = deps;

  if (buildId !== 'current' || runtime.source !== 'cloud') {
    return buildId;
  }

  let session = readSession({ cwd: runtime.projectRoot });

  if (session?.buildId && !session.expired) {
    return session.buildId;
  }

  let error = new Error(
    'No current cloud build found. Run "vizzly run" first, or pass a build ID.'
  );
  error.code = 'NO_CURRENT_CLOUD_BUILD';
  throw error;
}

function shouldExplainLocalSimilarityGap(
  requestedSource,
  command,
  localProvider
) {
  return (
    requestedSource === 'auto' &&
    command === 'similar' &&
    localProvider.isAvailable()
  );
}

async function loadContextRuntime(
  command,
  target,
  globalOptions,
  options,
  deps = {}
) {
  let {
    createLocalWorkspaceContextProvider = defaultCreateLocalWorkspaceContextProvider,
    resolveContextSource = defaultResolveContextSource,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  let config = await loadContextConfig(globalOptions, options, {
    ...deps,
    output,
    exit,
    requireApiKey: false,
  });
  let requestedSource = options.source || 'auto';
  let projectRoot = deps.projectRoot || process.cwd();
  let localProvider = createLocalWorkspaceContextProvider({ projectRoot });
  let source = resolveContextSource(
    {
      requestedSource,
      command,
      target,
      projectRoot,
      hasCloudScope: hasExplicitCloudScope(options, config),
    },
    {
      createLocalWorkspaceContextProvider,
    }
  );

  if (source === 'cloud' && !config.apiKey && !config.userToken) {
    if (
      shouldExplainLocalSimilarityGap(requestedSource, command, localProvider)
    ) {
      throw buildLocalFingerprintCapabilityError();
    }

    output.error(buildAuthErrorMessage());
    output.cleanup();
    exit(1);
    return null;
  }

  let provider =
    source === 'local'
      ? localProvider
      : createCloudContextProvider(config, deps);

  return {
    config,
    source,
    provider,
  };
}

function buildScopeQuery(options = {}, query = {}) {
  let scopedQuery = { ...query };

  if (options.project) {
    scopedQuery.project = options.project;
  }

  if (options.org) {
    scopedQuery.organization = options.org;
  }

  return scopedQuery;
}

function getStatusTone(colors, status) {
  if (status === 'changed' || status === 'pending' || status === 'failed') {
    return colors.brand.warning;
  }

  if (
    status === 'approved' ||
    status === 'completed' ||
    status === 'identical'
  ) {
    return colors.brand.success;
  }

  if (status === 'rejected' || status === 'error') {
    return colors.brand.error;
  }

  return colors.brand.info;
}

function getComparisonDisplayState(comparison = {}) {
  return comparison.result || comparison.status || 'unknown';
}

function isChangedComparison(comparison = {}) {
  return ['changed', 'failed', 'pending'].includes(
    getComparisonDisplayState(comparison)
  );
}

function isNewComparison(comparison = {}) {
  return getComparisonDisplayState(comparison) === 'new';
}

function getComparisonName(comparison = {}) {
  return (
    comparison.screenshot_name ||
    comparison.screenshot?.name ||
    comparison.name ||
    comparison.id ||
    'unknown screenshot'
  );
}

function getComparisonDiffPercentage(comparison = {}) {
  return comparison.diff?.percentage ?? comparison.diff_percentage ?? null;
}

function getComparisonFingerprint(comparison = {}) {
  return (
    comparison.diff?.fingerprint_hash ||
    comparison.analysis?.fingerprint_hash ||
    null
  );
}

/**
 * Decide whether a comparison belongs in the agent handoff.
 *
 * Explicit API review state wins because an already-reviewed visual change is
 * not actionable. Legacy result fallback keeps older flat responses useful
 * only when the server did not supply that review fact.
 *
 * @param {Object} comparison - Normalized comparison record.
 * @returns {boolean} Whether the record is actionable evidence.
 */
function isEvidenceCandidate(comparison = {}) {
  if (comparison.needs_review != null) {
    return comparison.needs_review === true;
  }

  return ['changed', 'new', 'failed', 'error'].includes(comparison.result);
}

/**
 * Keep the group facts needed to understand one comparison in isolation.
 *
 * Repeating this small server-owned summary on each record avoids returning
 * the full, potentially unbounded group tree in compact agent output.
 *
 * @param {Object} group - Normalized screenshot group.
 * @returns {Object} Compact API-backed aggregate facts for the group.
 */
function buildEvidenceGroup(group = {}) {
  let aggregate = group.aggregate_status || {};

  return {
    name: group.name || null,
    variant_count: group.variant_count ?? null,
    needs_review_count: aggregate.needs_review_count ?? null,
    failed_count: aggregate.failed_count ?? null,
    max_diff_percentage: aggregate.max_diff_percentage ?? null,
  };
}

/**
 * Shape one normalized comparison for the bounded evidence queue.
 *
 * The projection keeps visual result, review state, render assets, and
 * Honeydiff facts together so an agent can reason about a diff without
 * joining separate collections client-side.
 *
 * @param {Object} comparison - Normalized comparison record.
 * @param {Object} group - Normalized group containing the comparison.
 * @returns {Object} One self-contained comparison evidence record.
 */
function buildComparisonEvidence(comparison = {}, group = {}) {
  return {
    kind: 'comparison',
    id: comparison.id,
    name: comparison.name,
    result: comparison.result,
    status: comparison.status,
    review_state: comparison.review_state,
    visual_review: comparison.visual_review,
    approval_status: comparison.approval_status,
    needs_review: comparison.needs_review,
    is_flaky: comparison.is_flaky,
    group: buildEvidenceGroup(group),
    screenshot: comparison.screenshot,
    baseline: comparison.baseline,
    diff: comparison.diff,
  };
}

/**
 * Represent a capture failure without pretending it is a comparison.
 *
 * Failed screenshots have useful render evidence but no comparison ID. The
 * explicit kind and null ID prevent suggested commands from sending a
 * screenshot identifier to the comparison endpoint.
 *
 * @param {Object} capture - Normalized failed screenshot capture.
 * @returns {Object} One failed-capture evidence record.
 */
function buildFailedCaptureEvidence(capture = {}) {
  return {
    ...buildComparisonEvidence(capture, { name: capture.name }),
    kind: 'failed_capture',
    id: null,
    error_message: capture.error_message,
  };
}

/**
 * Read actionable variants without overriding a server-reviewed group.
 *
 * A false aggregate is authoritative even when a partial variant payload
 * appears pending, which prevents the client from reopening completed work.
 *
 * @param {Object} group - Normalized screenshot group.
 * @returns {Object[]} Actionable variants in API order.
 */
function getGroupEvidence(group = {}) {
  if (group.aggregate_status?.needs_review === false) {
    return [];
  }

  return (group.variants || []).filter(isEvidenceCandidate);
}

/**
 * Interleave actionable variants across groups in their original API order.
 *
 * Taking one variant per group before taking second variants preserves useful
 * breadth when the final handoff is capped and one screenshot has many device
 * or browser variants.
 *
 * @param {Object[]} groups - Normalized screenshot groups.
 * @returns {Object[]} Self-contained evidence records in breadth-first order.
 */
function selectBreadthFirstEvidence(groups = []) {
  let candidatesByGroup = groups.map(getGroupEvidence);
  let evidence = [];
  let variantIndex = 0;
  let remaining = candidatesByGroup.some(candidates => candidates.length > 0);

  while (remaining) {
    remaining = false;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      let comparison = candidatesByGroup[groupIndex][variantIndex];
      if (comparison) {
        evidence.push(buildComparisonEvidence(comparison, groups[groupIndex]));
        remaining = true;
      }
    }
    variantIndex += 1;
  }

  return evidence;
}

/**
 * Quote a value only when a suggested command needs shell protection.
 *
 * Suggested commands are meant to be executable, so names with whitespace or
 * apostrophes must survive copy and paste without changing their value.
 *
 * @param {unknown} value - CLI argument value.
 * @returns {string} A shell-safe argument for the displayed command.
 */
function quoteCommandArgument(value) {
  let stringValue = String(value);
  if (/^[A-Za-z0-9._:/-]+$/.test(stringValue)) {
    return stringValue;
  }

  return `'${stringValue.replaceAll("'", `'\\''`)}'`;
}

/**
 * Recognize both local source labels emitted across supported context shapes.
 *
 * @param {Object} context - Normalized context response.
 * @returns {boolean} Whether follow-up commands must stay in local mode.
 */
function isLocalContext(context = {}) {
  return ['local', 'local_workspace'].includes(context.source);
}

/**
 * Keep suggested commands on the same source as the evidence they inspect.
 *
 * Without the explicit local flag, an executable suggestion could silently
 * switch to cloud context and describe a different build.
 *
 * @param {string} command - Base CLI command.
 * @param {Object} context - Context that produced the command.
 * @returns {string} Command pinned to local context when needed.
 */
function appendLocalSource(command, context = {}) {
  return isLocalContext(context) ? `${command} --source local` : command;
}

/**
 * Build concrete drill-down paths from the evidence actually returned.
 *
 * Executable commands replace generic client-authored advice. They let an
 * agent ask the API for deeper comparison, history, or raw diff context, and
 * only suggest the full build when the bounded queue omitted records.
 *
 * @param {Object} context - Normalized build context.
 * @param {Object[]} evidence - Evidence included in the compact handoff.
 * @param {boolean} truncated - Whether additional evidence was omitted.
 * @returns {{label: string, command: string}[]} Suggested CLI commands.
 */
function buildSuggestedCommands(
  context = {},
  evidence = [],
  truncated = false
) {
  let commands = [];
  let firstComparison = evidence.find(
    item => item.kind === 'comparison' && item.id
  );
  let firstNamedEvidence = evidence.find(item => item.name);
  let buildTarget = isLocalContext(context)
    ? 'current'
    : context.build?.id || null;

  if (firstComparison?.id) {
    commands.push({
      label: 'Inspect comparison context',
      command: appendLocalSource(
        `vizzly --json context comparison ${quoteCommandArgument(firstComparison.id)}`,
        context
      ),
    });
  }

  if (firstNamedEvidence?.name) {
    commands.push({
      label: 'Inspect screenshot history',
      command: appendLocalSource(
        `vizzly --json context screenshot ${quoteCommandArgument(firstNamedEvidence.name)}`,
        context
      ),
    });
  }

  if (buildTarget && evidence.length > 0) {
    commands.push({
      label: 'Load raw diff diagnostics',
      command: appendLocalSource(
        `vizzly --json context build ${quoteCommandArgument(buildTarget)} --agent --include diffs`,
        context
      ),
    });
  }

  if (buildTarget && truncated) {
    commands.push({
      label: 'Load full build context',
      command: appendLocalSource(
        `vizzly --json context build ${quoteCommandArgument(buildTarget)} --agent --full`,
        context
      ),
    });
  }

  return commands;
}

/**
 * Create the compact agent presentation without rewriting API truth.
 *
 * Status, summaries, review facts, assets, and Honeydiff values pass through
 * normalization from the server. The client owns only the bounded selection,
 * truthful truncation facts, explicit includes, and follow-up commands.
 *
 * @param {Object} context - Raw build context returned by the provider.
 * @param {Object} options - Compact presentation options.
 * @param {string|null} [options.source] - Resolved source fallback.
 * @param {string[]} [options.include] - Explicit detail collections.
 * @param {number} [options.evidenceLimit] - Maximum evidence record count.
 * @returns {Object} Bounded agent build context.
 */
function buildAgentBuildPayload(
  context,
  { source = null, include = [], evidenceLimit = 10 } = {}
) {
  let includeSet = new Set(include);
  let includeDiffs = includeSet.has('diffs');
  let normalized = normalizeBuildContext(context, { includeDiffs });
  let candidates = [
    ...normalized.failed_captures.map(buildFailedCaptureEvidence),
    ...selectBreadthFirstEvidence(normalized.groups),
  ];
  let evidence = candidates.slice(0, evidenceLimit);
  let evidenceTruncated = candidates.length > evidence.length;
  let payload = {
    resource: 'build_agent_context',
    source: normalized.source || source || 'cloud',
    scope: normalized.scope || null,
    project: {
      organization: normalized.scope?.organization?.slug || null,
      slug: normalized.scope?.project?.slug || null,
      name: normalized.scope?.project?.name || null,
      visibility: normalized.scope?.project?.visibility || null,
    },
    build: normalized.build || null,
    baseline: {
      selected: normalized.baseline?.selected || null,
      selection_reason: normalized.baseline?.selection_reason || null,
    },
    status: normalized.status || null,
    summary: normalized.summary || null,
    signature_properties: normalized.signature_properties ?? null,
    evidence_limit: evidenceLimit,
    evidence_returned: evidence.length,
    evidence_truncated: evidenceTruncated,
    evidence,
    links: normalized.links || {},
    preview: normalized.preview || null,
    suggested_commands: buildSuggestedCommands(
      normalized,
      evidence,
      evidenceTruncated
    ),
  };

  if (includeSet.has('screenshots')) {
    payload.screenshots = normalized.screenshots || [];
  }

  if (includeSet.has('comments')) {
    payload.comments = normalized.comments || {};
  }

  return payload;
}

function getBuildCommentsCount(context = {}) {
  if (Array.isArray(context.comments?.build)) {
    return context.comments.build.length;
  }

  if (Array.isArray(context.review?.comments)) {
    return context.review.comments.length;
  }

  return 0;
}

function getScreenshotCommentsCount(context = {}) {
  if (Number.isInteger(context.comments?.screenshot_count)) {
    return context.comments.screenshot_count;
  }

  return 0;
}

function getReviewAssignmentsCount(context = {}) {
  if (Array.isArray(context.review?.assignments)) {
    return context.review.assignments.length;
  }

  return 0;
}

function formatNeedsReview(status = {}) {
  if (!status || status.needs_review == null) {
    return null;
  }

  if (!status.needs_review) {
    return 'no';
  }

  let details = [];
  if (status.pending_comparisons != null) {
    details.push(`${status.pending_comparisons} comparisons`);
  }
  if (status.unresolved_comments != null) {
    details.push(`${status.unresolved_comments} unresolved comments`);
  }

  return details.length > 0 ? `yes · ${details.join(' · ')}` : 'yes';
}

function formatConfirmedRegionLabels(regions = []) {
  return regions
    .map(region => region.label)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
}

function printComparisonList(output, comparisons = [], { limit = 5 } = {}) {
  let colors = output.getColors();

  for (let comparison of comparisons.slice(0, limit)) {
    let displayState = getComparisonDisplayState(comparison);
    let statusTone = getStatusTone(colors, displayState);
    let screenshotName = getComparisonName(comparison);
    let rawDiffPercentage = getComparisonDiffPercentage(comparison);
    let diffPercentage =
      rawDiffPercentage == null ? null : `${rawDiffPercentage}%`;
    let fingerprint = getComparisonFingerprint(comparison);
    let details = [];

    if (diffPercentage) {
      details.push(diffPercentage);
    }

    if (comparison.needs_review) {
      details.push('needs review');
    }

    if (fingerprint) {
      details.push(`fp:${fingerprint}`);
    }

    if (comparison.build_branch) {
      details.push(comparison.build_branch);
    }

    output.print(
      `  ${colors.bold(screenshotName)} ${statusTone(displayState.toUpperCase())}`
    );
    if (details.length > 0) {
      output.print(`    ${colors.dim(details.join(' · '))}`);
    }
  }
}

function getGroupDisplayState(group = {}) {
  let aggregate = group.aggregate_status || {};

  if ((aggregate.failed_count ?? 0) > 0) return 'failed';
  if (aggregate.has_rejected === true) return 'rejected';
  if (aggregate.has_changes === true) return 'changed';
  if (aggregate.has_new === true) return 'new';
  if (aggregate.needs_review === true) return 'needs review';
  if (aggregate.all_approved === true) return 'approved';
  return null;
}

function formatViewport(viewport) {
  if (!viewport) {
    return null;
  }

  return `${viewport.width ?? '?'}×${viewport.height ?? '?'}`;
}

function printScreenshotGroups(output, groups = [], { limit = 8 } = {}) {
  let colors = output.getColors();
  let visibleGroups = groups.slice(0, limit);

  output.print('  Screenshot groups');

  for (let group of visibleGroups) {
    let displayState = getGroupDisplayState(group);
    let tone = getStatusTone(colors, displayState);
    let aggregate = group.aggregate_status || {};
    let details = [];

    if (group.variant_count != null) {
      details.push(`${group.variant_count} variants`);
    }

    if (aggregate.needs_review_count != null) {
      details.push(`${aggregate.needs_review_count} needs review`);
    }
    if (aggregate.failed_count != null && aggregate.failed_count > 0) {
      details.push(`${aggregate.failed_count} failed`);
    }
    if (aggregate.max_diff_percentage != null) {
      details.push(`${aggregate.max_diff_percentage}% max diff`);
    }

    output.print(
      `  ${colors.bold(group.name)}${displayState ? ` ${tone(displayState.toUpperCase())}` : ''}`
    );
    if (details.length > 0) {
      output.print(`    ${colors.dim(details.join(' · '))}`);
    }

    for (let variant of group.variants.slice(0, 3)) {
      let variantDetails = [
        variant.review_state,
        variant.browser,
        formatViewport(variant.viewport),
      ].filter(Boolean);
      output.print(
        `    ${getStatusTone(colors, variant.result)((variant.result || 'unknown').toUpperCase())}${variantDetails.length > 0 ? ` · ${colors.dim(variantDetails.join(' · '))}` : ''}`
      );
    }
  }

  if (groups.length > visibleGroups.length) {
    output.print(
      `    ${colors.dim(`...${groups.length - visibleGroups.length} more groups`)}`
    );
  }
}

function printFailedCaptures(output, captures = []) {
  let colors = output.getColors();

  output.print('  Failed captures');
  for (let capture of captures.slice(0, 8)) {
    let details = [
      capture.error_message,
      capture.browser,
      formatViewport(capture.viewport),
      capture.screenshot.url,
    ].filter(Boolean);
    output.print(
      `  ${colors.bold(capture.name)} ${colors.brand.error('FAILED')}`
    );
    if (details.length > 0) {
      output.print(`    ${colors.dim(details.join(' · '))}`);
    }
  }
}

function formatReviewSummary(review = {}) {
  let details = [
    review.pending != null ? `${review.pending} pending` : null,
    review.approved != null ? `${review.approved} approved` : null,
    review.rejected != null ? `${review.rejected} rejected` : null,
  ].filter(Boolean);

  return details.length > 0 ? details.join(' · ') : null;
}

function displayBuildContext(output, context) {
  output.header('context', 'build');

  let normalizedContext = normalizeBuildContext(context);
  let colors = output.getColors();
  let build = normalizedContext.build || {};
  let buildTone = getStatusTone(colors, build.status);
  let comparisons = normalizedContext.comparisons;
  let groups = normalizedContext.groups;
  let screenshots = normalizedContext.screenshots || [];
  let failedCaptures = normalizedContext.failed_captures;
  let reviewSummary = formatReviewSummary(normalizedContext.summary?.review);
  let commentsSummary = normalizedContext.summary?.comments || {};
  let needsReview = formatNeedsReview(normalizedContext.status);
  let baseline = normalizedContext.baseline?.selected || null;
  let comparisonCount =
    normalizedContext.summary?.comparisons?.total ??
    normalizedContext.total_comparisons ??
    (Array.isArray(context.comparisons) ? comparisons.length : null);
  let screenshotCount =
    normalizedContext.summary?.screenshots?.total ??
    normalizedContext.screenshot_count ??
    (Array.isArray(context.screenshots) ? screenshots.length : null);

  output.print(
    `  ${colors.bold(build.name || build.id || 'unknown build')} ${buildTone((build.status || 'unknown').toUpperCase())}`
  );
  output.print(
    `  ${colors.dim(`@${normalizedContext.scope?.organization?.slug || 'unknown'}/${normalizedContext.scope?.project?.slug || 'unknown'}`)}`
  );
  output.blank();

  if (comparisonCount != null) {
    output.labelValue('Comparisons', String(comparisonCount));
  }
  if (groups.length > 0) {
    output.labelValue('Screenshot Groups', String(groups.length));
  }
  if (screenshotCount != null) {
    output.labelValue('Screenshots', String(screenshotCount));
  }
  if (baseline) {
    output.labelValue(
      'Baseline',
      `${baseline.name || baseline.id || 'selected'}${normalizedContext.baseline.selection_reason ? ` · ${normalizedContext.baseline.selection_reason}` : ''}`
    );
  }
  if (needsReview) {
    output.labelValue('Needs Review', needsReview);
  }
  if (reviewSummary) {
    output.labelValue('Review', reviewSummary);
  }

  let buildComments =
    commentsSummary.build ??
    (Array.isArray(normalizedContext.comments?.build)
      ? getBuildCommentsCount(normalizedContext)
      : null);
  let screenshotComments =
    commentsSummary.screenshot ??
    (Number.isInteger(normalizedContext.comments?.screenshot_count)
      ? getScreenshotCommentsCount(normalizedContext)
      : null);
  let assignments = Array.isArray(normalizedContext.review?.assignments)
    ? getReviewAssignmentsCount(normalizedContext)
    : null;
  let memory = [
    buildComments != null ? `${buildComments} build comments` : null,
    screenshotComments != null
      ? `${screenshotComments} screenshot comments`
      : null,
    assignments != null ? `${assignments} assignments` : null,
  ].filter(Boolean);
  if (memory.length > 0) {
    output.labelValue('Memory', memory.join(' · '));
  }

  if (normalizedContext.preview) {
    let previewUrl =
      normalizedContext.preview.preview_url || normalizedContext.preview.url;
    output.labelValue(
      'Preview',
      `${normalizedContext.preview.status || 'unknown'}${previewUrl ? ' · available' : ''}`
    );
  }

  if (normalizedContext.links?.build_url) {
    output.labelValue('Build URL', normalizedContext.links.build_url);
  }

  if (groups.length > 0) {
    output.blank();
    printScreenshotGroups(output, groups);
  }

  if (failedCaptures.length > 0) {
    output.blank();
    printFailedCaptures(output, failedCaptures);
  }
}

function formatAgentBuildContext(context) {
  let comparisons = context.comparisons || [];
  let changed = comparisons.filter(isChangedComparison);
  let fresh = comparisons.filter(isNewComparison);
  let needsReview = comparisons.filter(comparison => comparison.needs_review);
  let baseline = context.baseline?.selected;
  let lines = [
    `# Vizzly Visual Context: ${context.build?.name || context.build?.id || 'Build'}`,
    '',
    `Project: ${context.scope?.organization?.slug || 'unknown'}/${context.scope?.project?.slug || 'unknown'}`,
    `Build: ${context.build?.id || 'unknown'} (${context.build?.status || 'unknown'})`,
  ];

  if (baseline) {
    lines.push(
      `Approved baseline: ${baseline.name || baseline.id || 'selected'} (${baseline.approval_status || 'unknown'})`
    );
  }

  if (context.status) {
    lines.push(
      `Needs review: ${context.status.needs_review ? 'yes' : 'no'} (${context.status.pending_comparisons || 0} pending comparisons)`
    );
  }

  if (context.preview?.url || context.preview?.preview_url) {
    lines.push(
      `Preview: ${context.preview.url || context.preview.preview_url}`
    );
  }

  if (context.links?.build_url) {
    lines.push(`Build URL: ${context.links.build_url}`);
  }

  if (context.links?.report_url) {
    lines.push(`Report: ${context.links.report_url}`);
  }

  lines.push('');
  lines.push('## Diff Summary');
  lines.push(`- Total comparisons: ${comparisons.length}`);
  lines.push(`- Changed: ${changed.length}`);
  lines.push(`- New: ${fresh.length}`);
  lines.push(`- Needs review: ${needsReview.length}`);

  if (changed.length > 0 || fresh.length > 0) {
    lines.push('');
    lines.push('## Evidence To Inspect');

    for (let comparison of [...changed, ...fresh].slice(0, 10)) {
      let diffPercentage = getComparisonDiffPercentage(comparison);
      let detail = diffPercentage == null ? '' : ` · ${diffPercentage}% diff`;
      let diffUrl =
        comparison.diff?.image_url || comparison.analysis?.diff_image_url;
      lines.push(
        `- ${getComparisonName(comparison)}: ${getComparisonDisplayState(comparison)}${detail}`
      );
      if (diffUrl) {
        lines.push(`  Diff: ${diffUrl}`);
      }
    }
  }

  if (comparisons.length > 0 && changed.length === 0 && fresh.length === 0) {
    lines.push('');
    lines.push('## Reviewed Screenshots');

    for (let comparison of comparisons.slice(0, 10)) {
      lines.push(
        `- ${getComparisonName(comparison)}: ${getComparisonDisplayState(comparison)}`
      );
    }

    if (comparisons.length > 10) {
      lines.push(`- ...${comparisons.length - 10} more`);
    }
  }

  lines.push('');
  lines.push(
    'Use this as reviewed UI context. Treat approved baselines as visual truth, inspect meaningful diffs, and leave approval decisions to humans.'
  );

  return lines.join('\n');
}

function countScreenshotCommentEntries(groups = []) {
  return groups.reduce(
    (total, group) => total + (group.comments?.length || 0),
    0
  );
}

function displayComparisonContext(output, context) {
  output.header('context', 'comparison');

  let colors = output.getColors();
  let displayState = getComparisonDisplayState(context.comparison);
  let statusTone = getStatusTone(colors, displayState);
  let screenshotName =
    context.comparison.screenshot?.name || context.comparison.id;
  let analysis = context.comparison.analysis || {};
  let confirmedRegionLabels = formatConfirmedRegionLabels(
    context.history.confirmed_regions
  );

  output.print(
    `  ${colors.bold(screenshotName)} ${statusTone(displayState.toUpperCase())}`
  );
  output.print(
    `  ${colors.dim(`@${context.scope.organization.slug}/${context.scope.project.slug}`)}`
  );
  output.blank();

  output.labelValue(
    'Eyes',
    `${analysis.diff_image_url ? 'baseline/current/diff' : 'comparison metadata only'}`
  );
  output.labelValue(
    'Memory',
    `${context.history.similar_by_fingerprint.length} similar · ${context.history.recent_by_name.length} recent · ${context.history.confirmed_regions.length} confirmed regions`
  );
  output.labelValue(
    'Review',
    `${context.review.build_comments.length} build comments · ${countScreenshotCommentEntries(context.review.screenshot_comments)} screenshot comments`
  );

  if (analysis.fingerprint_hash) {
    output.labelValue('Fingerprint', analysis.fingerprint_hash);
  }

  if (confirmedRegionLabels) {
    output.labelValue('Known Regions', confirmedRegionLabels);
  }

  if (context.links?.comparison_url) {
    output.labelValue('Comparison URL', context.links.comparison_url);
  }

  if (context.history.similar_by_fingerprint.length > 0) {
    output.blank();
    output.print('  Similar Diffs');
    printComparisonList(output, context.history.similar_by_fingerprint);
  }
}

function displayScreenshotContext(output, context) {
  output.header('context', 'screenshot');

  let colors = output.getColors();
  let confirmedRegionLabels = formatConfirmedRegionLabels(
    context.confirmed_regions
  );

  output.print(`  ${colors.bold(context.screenshot.name)}`);
  output.print(
    `  ${colors.dim(`@${context.scope.organization.slug}/${context.scope.project.slug}`)}`
  );
  output.blank();

  output.labelValue(
    'Memory',
    `${context.history.recent_comparisons.length} recent comparisons · ${context.confirmed_regions.length} confirmed regions`
  );
  output.labelValue(
    'Hotspots',
    `${context.hotspot_analysis.total_builds_analyzed} builds analyzed · ${context.hotspot_analysis.confidence}`
  );

  if (confirmedRegionLabels) {
    output.labelValue('Known Regions', confirmedRegionLabels);
  }

  if (context.history.recent_comparisons.length > 0) {
    output.blank();
    output.print('  Recent Comparisons');
    printComparisonList(output, context.history.recent_comparisons);
  }
}

function displayFingerprintContext(output, context) {
  output.header('context', 'similar');

  let colors = output.getColors();
  let fingerprintHash =
    context.fingerprint?.hash || context.fingerprint_hash || 'unknown';
  let comparisons = context.comparisons || context.matches || [];

  output.print(`  ${colors.bold(fingerprintHash)}`);
  output.print(
    `  ${colors.dim(`@${context.scope.organization.slug}/${context.scope.project.slug}`)}`
  );
  output.blank();

  output.labelValue('Matches', String(comparisons.length));

  if (comparisons.length > 0) {
    output.blank();
    output.print('  Similar Diffs');
    printComparisonList(output, comparisons, { limit: 10 });
  }
}

function displayReviewQueueContext(output, context) {
  output.header('context', 'review');

  let colors = output.getColors();

  output.print(
    `  ${colors.bold(`${context.summary.total} pending comparisons`)}`
  );
  output.print(
    `  ${colors.dim(`@${context.scope.organization.slug}/${context.scope.project.slug}`)}`
  );
  output.blank();

  output.labelValue(
    'Queue',
    `${context.summary.changed} changed · ${context.summary.new} new · ${context.summary.builds} builds`
  );

  if (context.comparisons.length > 0) {
    output.blank();
    output.print('  Needs Review');
    printComparisonList(output, context.comparisons, { limit: 10 });
  }
}

export async function contextBuildCommand(
  buildId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'build',
      buildId,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }

    let resolvedBuildId = resolveBuildContextId(buildId, runtime, deps);
    let include = parseIncludeOption(options.include);
    let query =
      globalOptions.json && options.agent && !options.full
        ? { details: include.includes('diffs') ? 'diffs' : 'summary' }
        : undefined;

    output.startSpinner('Fetching build context...');
    let context = await runtime.provider.getBuildContext(
      resolvedBuildId,
      query
    );
    output.stopSpinner();

    if (globalOptions.json && options.agent && !options.full) {
      output.data(
        buildAgentBuildPayload(context, {
          source: runtime.source,
          include,
        })
      );
      output.cleanup();
      return;
    }

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    if (options.agent) {
      output.print(formatAgentBuildContext(context));
      output.cleanup();
      return;
    }

    displayBuildContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch build context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextComparisonCommand(
  comparisonId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'comparison',
      comparisonId,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = {
      similarLimit: options.similarLimit,
      recentLimit: options.recentLimit,
      windowSize: options.windowSize,
    };

    output.startSpinner('Fetching comparison context...');
    let context = await runtime.provider.getComparisonContext(
      comparisonId,
      query
    );
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayComparisonContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch comparison context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextScreenshotCommand(
  screenshotName,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'screenshot',
      screenshotName,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = buildScopeQuery(options, {
      recentLimit: options.recentLimit,
      windowSize: options.windowSize,
    });

    output.startSpinner('Fetching screenshot context...');
    let context = await runtime.provider.getScreenshotContext(
      screenshotName,
      query
    );
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayScreenshotContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch screenshot context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextSimilarCommand(
  fingerprintHash,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'similar',
      fingerprintHash,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = buildScopeQuery(options, {
      limit: options.limit,
    });

    output.startSpinner('Fetching similar visual context...');
    let context = await runtime.provider.getSimilarFingerprintContext(
      fingerprintHash,
      query
    );
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayFingerprintContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch similar visual context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextReviewQueueCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'review-queue',
      null,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = buildScopeQuery(options, {
      limit: options.limit,
      offset: options.offset,
    });

    output.startSpinner('Fetching review queue context...');
    let context = await runtime.provider.getReviewQueueContext(query);
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayReviewQueueContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch review queue context', error);
    output.cleanup();
    exit(1);
  }
}

export function validateContextBuildOptions(_options = {}) {
  let errors = validateSourceOption(_options.source);
  errors.push(...validateIncludeOption(_options.include));
  return errors;
}

export function validateContextComparisonOptions(options = {}) {
  let errors = [];
  errors.push(...validateSourceOption(options.source));
  errors.push(
    ...validateLimitRange(options.similarLimit, '--similar-limit', {
      max: 50,
    })
  );
  errors.push(
    ...validateLimitRange(options.recentLimit, '--recent-limit', {
      max: 50,
    })
  );
  errors.push(
    ...validateLimitRange(options.windowSize, '--window-size', {
      max: 50,
    })
  );
  return errors;
}

export function validateContextScreenshotOptions(options = {}) {
  let errors = validateScopedProjectOptions(options);
  errors.push(...validateSourceOption(options.source));
  errors.push(
    ...validateLimitRange(options.recentLimit, '--recent-limit', {
      max: 50,
    })
  );
  errors.push(
    ...validateLimitRange(options.windowSize, '--window-size', {
      max: 50,
    })
  );
  return errors;
}

export function validateContextSimilarOptions(options = {}) {
  let errors = validateScopedProjectOptions(options);
  errors.push(...validateSourceOption(options.source));
  errors.push(...validateLimitRange(options.limit, '--limit', { max: 50 }));
  return errors;
}

export function validateContextReviewQueueOptions(options = {}) {
  let errors = validateScopedProjectOptions(options);
  errors.push(...validateSourceOption(options.source));
  errors.push(...validateLimitRange(options.limit, '--limit', { max: 100 }));
  errors.push(...validateOffset(options.offset));
  return errors;
}
