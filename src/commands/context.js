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
import { VizzlyError } from '../errors/vizzly-error.js';
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
  return '--include must contain only: diffs';
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

function validateCursor(value) {
  if (value == null) {
    return [];
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return ['--cursor must be a non-empty opaque cursor'];
  }

  return [];
}

function validateOffset(value) {
  if (value == null) return [];
  if (!Number.isInteger(value) || value < 0) {
    return ['--offset must be a non-negative integer'];
  }
  return [];
}

let COMPACT_CONTEXT_LIMIT = 10;
let COMPACT_SUMMARY_MAX_BYTES = 64 * 1024;
let COMPACT_DIFFS_MAX_BYTES = 512 * 1024;

function getCompactPage(collection, label) {
  if (!collection || !Array.isArray(collection.items) || !collection.page) {
    throw new VizzlyError(
      `Vizzly returned an invalid compact ${label} collection`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (collection.items.length > COMPACT_CONTEXT_LIMIT) {
    throw new VizzlyError(
      `Vizzly returned more than ${COMPACT_CONTEXT_LIMIT} compact ${label} items`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (collection.items.some(item => !item || typeof item !== 'object')) {
    throw new VizzlyError(
      `Vizzly returned an invalid item in compact ${label}`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  let { page } = collection;
  let validLimit =
    Number.isInteger(page.limit) &&
    page.limit >= 1 &&
    page.limit <= COMPACT_CONTEXT_LIMIT;
  let validReturned =
    Number.isInteger(page.returned) &&
    page.returned === collection.items.length;
  let validTotal =
    page.total == null ||
    (Number.isInteger(page.total) &&
      page.total >= 0 &&
      page.total >= page.returned);
  let validHasMore = typeof page.has_more === 'boolean';
  let validCursor =
    page.next_cursor == null ||
    (typeof page.next_cursor === 'string' && page.next_cursor.length > 0);

  if (
    !validLimit ||
    !validReturned ||
    !validTotal ||
    !validHasMore ||
    !validCursor
  ) {
    throw new VizzlyError(
      `Vizzly returned invalid pagination facts for compact ${label}`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (page.included === false && collection.items.length > 0) {
    throw new VizzlyError(
      `Vizzly returned items for an omitted compact ${label} collection`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (page.has_more !== Boolean(page.next_cursor)) {
    throw new VizzlyError(
      `Vizzly returned contradictory pagination facts for compact ${label}`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  return collection;
}

function validateCompactContext(context, resource) {
  if (!context || typeof context !== 'object') {
    throw new VizzlyError(
      `Vizzly returned an invalid compact ${resource} context`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (context.resource !== `${resource}_context` || !context[resource]?.id) {
    throw new VizzlyError(
      `Vizzly returned an invalid compact ${resource} context`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (resource === 'build') {
    getCompactPage(context.evidence, 'build evidence');
  } else {
    let history = context.history || {};
    getCompactPage(history.similar_by_fingerprint, 'similar history');
    getCompactPage(history.recent_by_name, 'recent history');
  }

  return context;
}

function validateCompactOutputSize(payload, resource, details) {
  let bytes = Buffer.byteLength(JSON.stringify(payload));
  let maxBytes =
    details === 'diffs' ? COMPACT_DIFFS_MAX_BYTES : COMPACT_SUMMARY_MAX_BYTES;

  if (bytes > maxBytes) {
    throw new VizzlyError(
      `Vizzly produced an oversized compact ${resource} context`,
      'COMPACT_CONTEXT_OVERSIZED',
      { bytes, max_bytes: maxBytes }
    );
  }

  return payload;
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

function buildCompactContextRequest(options = {}, globalOptions = {}) {
  let include = parseIncludeOption(options.include);
  let compact = !options.full && (!globalOptions.json || options.agent);
  let details = include.includes('diffs') ? 'diffs' : 'summary';

  return {
    compact,
    details,
    include,
    query: compact
      ? {
          details,
          limit: COMPACT_CONTEXT_LIMIT,
          cursor: options.cursor,
        }
      : undefined,
  };
}

function validateIncludeOption(value) {
  let allowed = new Set(['diffs']);
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

/**
 * Attach the provider that produced a context payload.
 *
 * Context endpoints return API-owned evidence, while source selection belongs
 * to the CLI. Keeping both in one payload prevents follow-up agent commands
 * from silently crossing between cloud and local evidence.
 *
 * @param {Object} context - Context payload returned by a provider.
 * @param {string} source - Provider source selected by the CLI.
 * @returns {Object} Context payload with explicit source provenance.
 */
function attachContextSource(context, source) {
  return { ...context, source };
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
      return attachContextSource(
        await getBuildContext(client, buildId, query),
        'cloud'
      );
    },
    async getComparisonContext(comparisonId, query) {
      return attachContextSource(
        await getComparisonContext(client, comparisonId, query),
        'cloud'
      );
    },
    async getScreenshotContext(screenshotName, query) {
      return attachContextSource(
        await getScreenshotContext(client, screenshotName, query),
        'cloud'
      );
    },
    async getSimilarFingerprintContext(fingerprintHash, query) {
      return attachContextSource(
        await getSimilarFingerprintContext(client, fingerprintHash, query),
        'cloud'
      );
    },
    async getReviewQueueContext(query) {
      return attachContextSource(
        await getReviewQueueContext(client, query),
        'cloud'
      );
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
 * Keep executable suggestions on the source that produced their evidence.
 *
 * Mixed workspaces can contain both a cloud run session and persisted local
 * TDD results. Pinning either source prevents a follow-up command from
 * silently crossing that boundary and describing a different build.
 *
 * @param {string} command - Base CLI command.
 * @param {Object} context - Context that produced the command.
 * @returns {string} Command pinned to its originating source.
 */
function appendContextSource(command, context = {}) {
  let source = isLocalContext(context) ? 'local' : 'cloud';
  return `${command} --source ${source}`;
}

function buildCompactBuildCommands(context = {}, include = [], cursor = null) {
  let evidence = context.evidence?.items || [];
  let page = context.evidence?.page || {};
  let commands = [];
  let buildTarget = isLocalContext(context)
    ? 'current'
    : context.build?.id || null;
  let firstComparison = evidence.find(
    item => item.type === 'comparison' && item.id
  );
  let firstNamedEvidence = evidence.find(item => item.screenshot_name);

  if (firstComparison) {
    commands.push({
      label: 'Inspect comparison context',
      command: appendContextSource(
        `vizzly --json context comparison ${quoteCommandArgument(firstComparison.id)} --agent`,
        context
      ),
    });
  }

  if (firstNamedEvidence) {
    let screenshotName = firstNamedEvidence.screenshot_name;
    commands.push({
      label: 'Inspect screenshot history',
      command: appendContextSource(
        `vizzly --json context screenshot ${quoteCommandArgument(screenshotName)}`,
        context
      ),
    });
  }

  if (buildTarget && evidence.length > 0 && !include.includes('diffs')) {
    let cursorFlag = cursor ? ` --cursor ${quoteCommandArgument(cursor)}` : '';
    commands.push({
      label: 'Load raw diff diagnostics',
      command: appendContextSource(
        `vizzly --json context build ${quoteCommandArgument(buildTarget)} --agent --include diffs${cursorFlag}`,
        context
      ),
    });
  }

  if (buildTarget && page.has_more && page.next_cursor) {
    let includeFlag =
      include.length > 0 ? ` --include ${include.join(',')}` : '';
    commands.push({
      label: 'Load next evidence page',
      command: appendContextSource(
        `vizzly --json context build ${quoteCommandArgument(buildTarget)} --agent --cursor ${quoteCommandArgument(page.next_cursor)}${includeFlag}`,
        context
      ),
    });
  }

  if (buildTarget) {
    commands.push({
      label: 'Load full build context',
      command: appendContextSource(
        `vizzly --json context build ${quoteCommandArgument(buildTarget)} --agent --full`,
        context
      ),
    });
  }

  return commands;
}

function buildCompactBuildPayload(context, include = [], cursor = null) {
  return {
    ...context,
    resource: 'build_agent_context',
    suggested_commands: buildCompactBuildCommands(context, include, cursor),
  };
}

function buildCompactComparisonCommands(context = {}, include = []) {
  let commands = [];
  let comparisonId = context.comparison?.id;
  let streams = [
    ['similar_by_fingerprint', 'similar history'],
    ['recent_by_name', 'recent history'],
  ];
  let includeFlag = include.length > 0 ? ` --include ${include.join(',')}` : '';

  if (comparisonId && !include.includes('diffs')) {
    commands.push({
      label: 'Load raw diff diagnostics',
      command: appendContextSource(
        `vizzly --json context comparison ${quoteCommandArgument(comparisonId)} --agent --include diffs`,
        context
      ),
    });
  }

  for (let [stream, label] of streams) {
    let page = context.history?.[stream]?.page;
    if (!comparisonId || !page?.has_more || !page.next_cursor) {
      continue;
    }

    commands.push({
      label: `Load next ${label} page`,
      command: appendContextSource(
        `vizzly --json context comparison ${quoteCommandArgument(comparisonId)} --agent --cursor ${quoteCommandArgument(page.next_cursor)}${includeFlag}`,
        context
      ),
    });
  }

  if (comparisonId) {
    commands.push({
      label: 'Load full comparison context',
      command: appendContextSource(
        `vizzly --json context comparison ${quoteCommandArgument(comparisonId)} --agent --full`,
        context
      ),
    });
  }

  return commands;
}

function buildCompactComparisonPayload(context, include = []) {
  return {
    ...context,
    resource: 'comparison_agent_context',
    suggested_commands: buildCompactComparisonCommands(context, include),
  };
}

function formatKnownBoolean(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}

function formatCompactPage(collection) {
  let page = collection?.page || {};
  let returned = page.returned ?? collection?.items?.length;
  let total = page.total;

  if (returned == null) return 'unknown';
  if (total == null) return String(returned);
  return `${returned} of ${total}${page.has_more ? ' · more available' : ''}`;
}

function displayCompactHeading(output, context, title, status) {
  let colors = output.getColors();
  let tone = getStatusTone(colors, status);
  let organization = context.scope?.organization?.slug || 'unknown';
  let project = context.scope?.project?.slug || 'unknown';

  output.print(`  ${colors.bold(title)} ${tone(status.toUpperCase())}`);
  output.print(`  ${colors.dim(`@${organization}/${project}`)}`);
  output.blank();
}

function displayCompactBuildContext(output, context) {
  output.header('context', 'build');
  let colors = output.getColors();
  let build = context.build || {};
  let displayStatus = build.status || context.status?.state || 'unknown';
  displayCompactHeading(
    output,
    context,
    build.name || build.id || 'unknown build',
    displayStatus
  );
  output.labelValue(
    'Attention',
    formatKnownBoolean(context.status?.needs_review)
  );
  output.labelValue('Evidence', formatCompactPage(context.evidence));

  let items = context.evidence?.items || [];
  if (items.length > 0) {
    output.blank();
    output.print('  Evidence');
    for (let item of items) {
      let result = item.result || item.status || 'unknown';
      let percentage = getComparisonDiffPercentage(item);
      let detail = percentage == null ? '' : ` · ${percentage}% diff`;
      output.print(
        `  ${colors.dim('•')} ${getComparisonName(item)}: ${result}${detail}`
      );
    }
  }

  if (context.evidence?.page?.has_more) {
    let next = context.suggested_commands?.find(
      command => command.label === 'Load next evidence page'
    );
    if (next) {
      output.blank();
      output.labelValue('Next', next.command);
    }
  }

  if (context.links?.build_url) {
    output.labelValue('Build URL', context.links.build_url);
  }
}

function displayCompactComparisonContext(output, context) {
  output.header('context', 'comparison');
  let comparison = context.comparison || {};
  let displayState = getComparisonDisplayState(comparison);
  displayCompactHeading(
    output,
    context,
    getComparisonName(comparison),
    displayState
  );
  output.labelValue(
    'Images',
    comparison.diff?.image_url || comparison.analysis?.diff_image_url
      ? 'baseline/current/diff available'
      : 'unavailable'
  );
  output.labelValue(
    'Similar history',
    formatCompactPage(context.history?.similar_by_fingerprint)
  );
  output.labelValue(
    'Recent history',
    formatCompactPage(context.history?.recent_by_name)
  );

  let similar = context.history?.similar_by_fingerprint?.items || [];
  if (similar.length > 0) {
    output.blank();
    output.print('  Similar Diffs');
    printComparisonList(output, similar);
  }

  let recent = context.history?.recent_by_name?.items || [];
  if (recent.length > 0) {
    output.blank();
    output.print('  Recent Diffs');
    printComparisonList(output, recent);
  }

  if (context.links?.comparison_url) {
    output.labelValue('Comparison URL', context.links.comparison_url);
  }
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
    `${context.history.similar_by_fingerprint.length} similar · ${context.history.recent_by_name.length} recent`
  );
  output.labelValue(
    'Review',
    `${context.review.build_comments.length} build comments · ${countScreenshotCommentEntries(context.review.screenshot_comments)} screenshot comments`
  );

  if (analysis.fingerprint_hash) {
    output.labelValue('Fingerprint', analysis.fingerprint_hash);
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

  output.print(`  ${colors.bold(context.screenshot.name)}`);
  output.print(
    `  ${colors.dim(`@${context.scope.organization.slug}/${context.scope.project.slug}`)}`
  );
  output.blank();

  output.labelValue(
    'Memory',
    `${context.history.recent_comparisons.length} recent comparisons`
  );

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
    let { compact, details, include, query } = buildCompactContextRequest(
      options,
      globalOptions
    );

    output.startSpinner('Fetching build context...');
    let context = await runtime.provider.getBuildContext(
      resolvedBuildId,
      query
    );
    output.stopSpinner();

    if (compact) {
      let compactContext = validateCompactContext(context, 'build');
      let payload = validateCompactOutputSize(
        buildCompactBuildPayload(compactContext, include, options.cursor),
        'build',
        details
      );

      if (globalOptions.json) {
        output.data(payload);
      } else {
        displayCompactBuildContext(output, payload);
      }
      output.cleanup();
      return;
    }

    if (globalOptions.json) {
      output.data(context);
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
    let { compact, details, include, query } = buildCompactContextRequest(
      options,
      globalOptions
    );

    output.startSpinner('Fetching comparison context...');
    let context = await runtime.provider.getComparisonContext(
      comparisonId,
      query
    );
    output.stopSpinner();

    if (compact) {
      let compactContext = validateCompactContext(context, 'comparison');
      let payload = validateCompactOutputSize(
        buildCompactComparisonPayload(compactContext, include),
        'comparison',
        details
      );

      if (globalOptions.json) {
        output.data(payload);
      } else {
        displayCompactComparisonContext(output, payload);
      }
      output.cleanup();
      return;
    }

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
  errors.push(...validateCursor(_options.cursor));
  return errors;
}

export function validateContextComparisonOptions(options = {}) {
  let errors = [];
  errors.push(...validateSourceOption(options.source));
  errors.push(...validateIncludeOption(options.include));
  errors.push(...validateCursor(options.cursor));
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
