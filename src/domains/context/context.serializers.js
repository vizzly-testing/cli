import { COMPACT_CONTEXT_LIMIT } from './compact-context.validations.js';
import { parseIncludeOption } from './context.validations.js';

export function buildCompactContextRequest(options = {}, globalOptions = {}) {
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

export function buildScopeQuery(options = {}, query = {}) {
  let scopedQuery = { ...query };

  if (options.project) {
    scopedQuery.project = options.project;
  }

  if (options.org) {
    scopedQuery.organization = options.org;
  }

  return scopedQuery;
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

export function buildCompactBuildPayload(context, include = [], cursor = null) {
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

export function buildCompactComparisonPayload(context, include = []) {
  return {
    ...context,
    resource: 'comparison_agent_context',
    suggested_commands: buildCompactComparisonCommands(context, include),
  };
}
