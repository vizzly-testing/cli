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
import {
  normalizeBuildContext,
  summarizeComparisonGroups,
} from '../utils/visual-context-normalizers.js';

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
    async getBuildContext(buildId) {
      return await getBuildContext(client, buildId);
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

function getComparisonDiffImageUrl(comparison = {}) {
  return (
    comparison.diff?.image_url || comparison.analysis?.diff_image_url || null
  );
}

function getComparisonRegionCount(comparison = {}) {
  let regions = comparison.diff?.regions || comparison.analysis?.diff_regions;
  return Array.isArray(regions) ? regions.length : 0;
}

function getComparisonScreenshot(comparison = {}) {
  return comparison.screenshot || {};
}

function getComparisonBaseline(comparison = {}) {
  return comparison.baseline || comparison.screenshot?.baseline || {};
}

function buildCompactDiff(comparison = {}, includeDiffs = false) {
  let diff = comparison.diff || comparison.analysis || {};
  let compact = {
    percentage: getComparisonDiffPercentage(comparison),
    changed_pixels: diff.changed_pixels ?? comparison.changed_pixels ?? null,
    total_pixels: diff.total_pixels ?? comparison.total_pixels ?? null,
    threshold: diff.threshold ?? comparison.threshold ?? null,
    fingerprint_hash: getComparisonFingerprint(comparison),
    region_count: getComparisonRegionCount(comparison),
    image_url: getComparisonDiffImageUrl(comparison),
  };

  if (includeDiffs) {
    compact.regions = diff.regions || diff.diff_regions || [];
    compact.cluster_metadata = diff.cluster_metadata || null;
    compact.ssim_score = diff.ssim_score ?? null;
    compact.gmsd_score = diff.gmsd_score ?? null;
    compact.diff_lines = diff.diff_lines || [];
  }

  return compact;
}

function buildCompactComparison(
  comparison = {},
  { includeDiffs = false } = {}
) {
  let screenshot = getComparisonScreenshot(comparison);
  let baseline = getComparisonBaseline(comparison);

  return {
    id: comparison.id || null,
    name: getComparisonName(comparison),
    result: getComparisonDisplayState(comparison),
    approval_status: comparison.approval_status || null,
    needs_review: Boolean(comparison.needs_review),
    is_flaky: Boolean(comparison.is_flaky),
    screenshot: {
      id: screenshot.id || null,
      url: screenshot.url || screenshot.original_url || null,
    },
    baseline: {
      id: baseline.id || null,
      build_id: baseline.build_id || null,
      url: baseline.url || baseline.original_url || null,
    },
    diff: buildCompactDiff(comparison, includeDiffs),
  };
}

function summarizeComparisons(comparisons = []) {
  return {
    total: comparisons.length,
    changed: comparisons.filter(isChangedComparison).length,
    new: comparisons.filter(isNewComparison).length,
    needs_review: comparisons.filter(comparison => comparison.needs_review)
      .length,
  };
}

function isLocalContext(context = {}) {
  return context.source === 'local' || context.source === 'local_workspace';
}

function appendSourceOption(command, context = {}) {
  return isLocalContext(context) ? `${command} --source local` : command;
}

function getBuildContextCommandTarget(context = {}) {
  if (isLocalContext(context)) {
    return 'current';
  }

  return context.build?.id || null;
}

function buildSuggestedCommands(context = {}) {
  let buildTarget = getBuildContextCommandTarget(context);
  let commands = [];

  if (!isLocalContext(context) && context.build?.id) {
    commands.push({
      label: 'Check build status',
      command: `vizzly status ${context.build.id}`,
    });
  }

  if (buildTarget) {
    commands.push({
      label: 'Review build context',
      command: appendSourceOption(
        `vizzly context build ${buildTarget}`,
        context
      ),
    });
  }

  let firstActionableGroup = sortGroupsForTriage(context.groups || []).find(
    group => {
      return (
        group.aggregate_status?.has_changes || group.aggregate_status?.has_new
      );
    }
  );
  let firstActionableVariant = firstActionableGroup?.primary_variant;

  if (firstActionableVariant?.id) {
    commands.push({
      label: 'Inspect top comparison',
      command: appendSourceOption(
        `vizzly context comparison ${firstActionableVariant.id}`,
        context
      ),
    });
  }

  if (firstActionableGroup?.name) {
    commands.push({
      label: 'Inspect screenshot history',
      command: appendSourceOption(
        `vizzly context screenshot "${firstActionableGroup.name}"`,
        context
      ),
    });
  }

  return commands;
}

function buildAgentNextActions(context = {}, comparisonSummary = {}) {
  if (context.status?.needs_review) {
    return [
      'Inspect the changed and new comparisons before editing related UI.',
      'Use approved baselines as the expected visual behavior.',
      'Leave approval decisions to human reviewers.',
    ];
  }

  if (comparisonSummary.total > 0) {
    return [
      'Use the approved baseline and reviewed screenshots as current visual truth.',
      'Prefer targeted edits that preserve identical comparisons.',
    ];
  }

  return [
    'No comparisons were returned for this build context.',
    'Open the build URL for more detail if this is unexpected.',
  ];
}

function formatAgentStatus(status = {}) {
  return {
    needs_review: Boolean(status.needs_review),
    reasons: status.reasons || [],
    pending_comparisons: status.pending_comparisons || 0,
    unresolved_comments: status.unresolved_comments || 0,
  };
}

function formatAgentSummary(context = {}, comparisons = []) {
  return {
    comparisons:
      context.summary?.comparisons || summarizeComparisons(comparisons),
    groups:
      context.summary?.groups ||
      summarizeComparisonGroups(context.groups || []),
    review: context.summary?.review || {},
    comments: context.summary?.comments || {
      build: getBuildCommentsCount(context),
      screenshot: getScreenshotCommentsCount(context),
    },
  };
}

function selectEvidenceComparisons(groups = [], rawComparisons = []) {
  let rawComparisonById = new Map(
    rawComparisons
      .filter(comparison => comparison.id)
      .map(comparison => [comparison.id, comparison])
  );
  let evidence = [];
  let selectedIds = new Set();

  for (let group of groups) {
    let variants = (group.variants || []).filter(variant => {
      return isChangedComparison(variant) || isNewComparison(variant);
    });

    for (let variant of variants) {
      let id =
        variant.id ||
        `${variant.name}:${variant.browser}:${variant.viewport?.display}`;

      if (selectedIds.has(id)) {
        continue;
      }

      selectedIds.add(id);
      evidence.push(rawComparisonById.get(variant.id) || variant);
    }
  }

  return evidence;
}

function buildAgentBuildPayload(
  context,
  { source = null, include = [], evidenceLimit = 10 } = {}
) {
  let normalizedContext = normalizeBuildContext(context);
  let rawComparisons = context.comparisons || [];
  let comparisons = normalizedContext.comparisons || [];
  let groups = sortGroupsForTriage(normalizedContext.groups || []);
  let includeSet = new Set(include);
  let includeDiffs = includeSet.has('diffs');
  let evidenceComparisons = selectEvidenceComparisons(groups, rawComparisons);
  let fallbackEvidenceComparisons =
    rawComparisons.length > 0 ? rawComparisons : comparisons;
  let fallbackChanged = fallbackEvidenceComparisons.filter(isChangedComparison);
  let fallbackFresh = fallbackEvidenceComparisons.filter(isNewComparison);
  let evidenceSource =
    evidenceComparisons.length > 0
      ? evidenceComparisons
      : [...fallbackChanged, ...fallbackFresh];
  let evidence = evidenceSource
    .slice(0, evidenceLimit)
    .map(comparison => buildCompactComparison(comparison, { includeDiffs }));
  let comparisonSummary = summarizeComparisons(comparisons);
  let payload = {
    resource: 'build_agent_context',
    source: normalizedContext.source || source || 'cloud',
    scope: normalizedContext.scope || null,
    project: {
      organization: normalizedContext.scope?.organization?.slug || null,
      slug: normalizedContext.scope?.project?.slug || null,
      name: normalizedContext.scope?.project?.name || null,
      visibility: normalizedContext.scope?.project?.visibility || null,
    },
    build: normalizedContext.build || null,
    baseline: {
      selected: normalizedContext.baseline?.selected || null,
      selection_reason: normalizedContext.baseline?.selection_reason || null,
    },
    status: formatAgentStatus(normalizedContext.status),
    summary: formatAgentSummary(normalizedContext, comparisons),
    groups,
    evidence,
    links: normalizedContext.links || {},
    preview: normalizedContext.preview || null,
    suggested_commands: buildSuggestedCommands(normalizedContext),
    next_actions: buildAgentNextActions(normalizedContext, comparisonSummary),
  };

  if (includeSet.has('screenshots')) {
    payload.screenshots = context.screenshots || [];
  }

  if (includeSet.has('comments')) {
    payload.comments = context.comments || {};
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

  let pending = status.pending_comparisons || 0;
  let unresolved = status.unresolved_comments || 0;

  if (!status.needs_review) {
    return 'no';
  }

  return `yes · ${pending} comparisons · ${unresolved} unresolved comments`;
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

function formatGroupStatus(group = {}) {
  let status = group.aggregate_status || {};
  let parts = [];

  if (status.has_rejected) {
    parts.push('rejected');
  }
  if (status.has_flaky) {
    parts.push('flaky');
  }
  if (status.has_changes) {
    parts.push('changed');
  }
  if (status.has_new) {
    parts.push('new');
  }
  if (status.all_approved) {
    parts.push('approved');
  }

  return parts.length > 0 ? parts.join(' · ') : 'unchanged';
}

function formatDiffPercentage(value) {
  return value == null ? null : `${value}%`;
}

function sortGroupsForTriage(groups = []) {
  return [...groups].sort((a, b) => {
    let priorityDifference =
      (b.aggregate_status?.status_priority || 0) -
      (a.aggregate_status?.status_priority || 0);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    let diffDifference =
      (b.aggregate_status?.max_diff_percentage || 0) -
      (a.aggregate_status?.max_diff_percentage || 0);

    if (diffDifference !== 0) {
      return diffDifference;
    }

    return (a.name || '').localeCompare(b.name || '');
  });
}

function printScreenshotGroups(output, groups = [], { limit = 8 } = {}) {
  let colors = output.getColors();
  let visibleGroups = sortGroupsForTriage(groups).slice(0, limit);

  output.print('  Screenshot groups');

  for (let group of visibleGroups) {
    let status = formatGroupStatus(group);
    let maxDiff = formatDiffPercentage(
      group.aggregate_status?.max_diff_percentage
    );
    let details = [
      `variants ${group.variant_count || group.variants?.length || 0}`,
      status,
    ];

    if (maxDiff) {
      details.push(`max diff ${maxDiff}`);
    }

    if (group.comment_count > 0) {
      details.push(`${group.comment_count} comments`);
    }

    output.print(`  ${colors.bold(group.name || 'unknown screenshot')}`);
    output.print(`    ${colors.dim(details.join(' · '))}`);

    for (let variant of (group.variants || []).slice(0, 3)) {
      let variantDetails = [
        variant.browser,
        variant.viewport?.display,
        variant.result,
        variant.needs_review ? 'needs review' : null,
        variant.diff?.fingerprint_hash
          ? `fp:${variant.diff.fingerprint_hash}`
          : null,
      ].filter(Boolean);

      output.print(`    ${colors.dim(variantDetails.join(' · '))}`);
    }
  }

  if (groups.length > visibleGroups.length) {
    output.print(
      `    ${colors.dim(`...${groups.length - visibleGroups.length} more groups`)}`
    );
  }
}

function printSuggestedCommands(output, commands = []) {
  if (commands.length === 0) {
    return;
  }

  let colors = output.getColors();
  output.blank();
  output.print('  Suggested commands');

  for (let item of commands) {
    output.print(`    ${colors.dim(item.command)}`);
  }
}

function displayBuildContext(output, context) {
  let normalizedContext = normalizeBuildContext(context);
  output.header('context', 'build');

  let colors = output.getColors();
  let buildTone = getStatusTone(colors, normalizedContext.build.status);
  let comparisons = normalizedContext.comparisons || [];
  let screenshots = normalizedContext.screenshots || [];
  let groups = normalizedContext.groups || [];
  let reviewSummary = normalizedContext.summary?.review || {};
  let commentsSummary = normalizedContext.summary?.comments || {};
  let needsReview = formatNeedsReview(normalizedContext.status);
  let baseline = normalizedContext.baseline?.selected || null;

  output.print(
    `  ${colors.bold(normalizedContext.build.name || normalizedContext.build.id)} ${buildTone((normalizedContext.build.status || 'unknown').toUpperCase())}`
  );
  output.print(
    `  ${colors.dim(`@${normalizedContext.scope.organization.slug}/${normalizedContext.scope.project.slug}`)}`
  );
  output.blank();

  output.labelValue('Comparisons', String(comparisons.length));
  if (groups.length > 0) {
    output.labelValue('Screenshot Groups', String(groups.length));
  }
  if (screenshots.length > 0) {
    output.labelValue('Screenshots', String(screenshots.length));
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
  output.labelValue(
    'Review',
    `${reviewSummary.pending || 0} pending · ${reviewSummary.approved || 0} approved · ${reviewSummary.rejected || 0} rejected`
  );
  output.labelValue(
    'Memory',
    `${commentsSummary.build ?? getBuildCommentsCount(context)} build comments · ${commentsSummary.screenshot ?? getScreenshotCommentsCount(context)} screenshot comments · ${getReviewAssignmentsCount(context)} assignments`
  );

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
  } else if (comparisons.length > 0) {
    output.blank();
    output.print('  Comparisons');
    printComparisonList(output, comparisons);
  }

  let failedScreenshots = screenshots.filter(
    screenshot => screenshot.status === 'failed'
  );
  if (failedScreenshots.length > 0) {
    output.blank();
    output.print('  Failed screenshots');
    for (let screenshot of failedScreenshots) {
      let viewport = screenshot.viewport
        ? `${screenshot.viewport.width || '?'}x${screenshot.viewport.height || '?'}`
        : null;
      let bitmap = screenshot.bitmap
        ? `${screenshot.bitmap.width || '?'}x${screenshot.bitmap.height || '?'}`
        : null;
      let details = [
        screenshot.browser,
        viewport && `viewport ${viewport}`,
        bitmap && `image ${bitmap}`,
      ].filter(Boolean);

      output.print(
        `  ${colors.bold(screenshot.name || screenshot.id || 'unknown screenshot')}`
      );
      if (details.length > 0)
        output.print(`    ${colors.dim(details.join(' · '))}`);
      if (screenshot.error_message)
        output.print(`    ${screenshot.error_message}`);
    }
  }

  printSuggestedCommands(output, buildSuggestedCommands(normalizedContext));
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

  let failedScreenshots = (context.screenshots || []).filter(
    screenshot => screenshot.status === 'failed'
  );
  if (failedScreenshots.length > 0) {
    lines.push('');
    lines.push('## Failed Screenshots');
    for (let screenshot of failedScreenshots) {
      lines.push(
        `- ${screenshot.name || screenshot.id || 'unknown screenshot'}`
      );
      if (screenshot.error_message)
        lines.push(`  Reason: ${screenshot.error_message}`);
    }
  }

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

    output.startSpinner('Fetching build context...');
    let context = await runtime.provider.getBuildContext(resolvedBuildId);
    output.stopSpinner();

    if (globalOptions.json && options.agent && !options.full) {
      output.data(
        buildAgentBuildPayload(context, {
          source: runtime.source,
          include: parseIncludeOption(options.include),
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
