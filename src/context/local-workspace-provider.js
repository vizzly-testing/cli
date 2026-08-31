import { createHash } from 'node:crypto';
import { existsSync as defaultExistsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeReportData } from '../utils/report-data.js';

let LOCAL_CONTEXT_SOURCE = 'local_workspace';
let DEFAULT_LOCAL_REVIEW_QUEUE_LIMIT = 50;

function readJsonIfExists(path) {
  if (!defaultExistsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function createEmptyReportData() {
  return {
    timestamp: Date.now(),
    comparisons: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      rejected: 0,
      errors: 0,
    },
  };
}

function mapComparisonResult(status) {
  if (status === 'new') {
    return 'new';
  }

  if (status === 'failed' || status === 'rejected') {
    return 'changed';
  }

  if (status === 'passed' || status === 'baseline-created') {
    return 'identical';
  }

  if (status === 'error') {
    return 'error';
  }

  return status || 'unknown';
}

function mapReviewState(status) {
  if (status === 'failed' || status === 'new') {
    return 'pending';
  }

  if (status === 'rejected') {
    return 'rejected';
  }

  if (status === 'passed' || status === 'baseline-created') {
    return 'approved';
  }

  return status || 'unknown';
}

function buildLocalScope(projectRoot) {
  let projectName = basename(projectRoot);

  return {
    organization: {
      id: null,
      name: 'Local Workspace',
      slug: 'local',
    },
    project: {
      id: null,
      name: projectName,
      slug: projectName,
    },
  };
}

function resolveAssetReference(assetPath, snapshot) {
  if (!assetPath) {
    return null;
  }

  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }

  if (assetPath.startsWith('/images/')) {
    if (snapshot.serverInfo?.port) {
      return `http://127.0.0.1:${snapshot.serverInfo.port}${assetPath}`;
    }

    return join(snapshot.vizzlyDir, assetPath.replace('/images/', ''));
  }

  if (isAbsolute(assetPath)) {
    return assetPath;
  }

  return assetPath;
}

function buildComparisonLinks(snapshot, comparisonId) {
  if (!snapshot.serverInfo?.port) {
    return {};
  }

  return {
    build_url: `http://127.0.0.1:${snapshot.serverInfo.port}/builds`,
    comparison_url: `http://127.0.0.1:${snapshot.serverInfo.port}/comparison/${encodeURIComponent(comparisonId)}`,
  };
}

/**
 * Describe the local evidence set without borrowing cloud run identity.
 *
 * A cloud `session.json` can coexist with older file-backed TDD evidence. Using
 * that session here makes stale local comparisons look like the current cloud
 * build, so local identity comes only from the active local server.
 *
 * @param {Object} snapshot - Persisted local workspace evidence.
 * @returns {Object} Build-shaped identity for the local context payload.
 */
function buildBuildSnapshot(snapshot) {
  let buildId = snapshot.serverInfo?.buildId || 'local-workspace';

  return {
    id: buildId,
    name: buildId,
    branch: 'local',
    commit_sha: null,
    commit_message: null,
    review_state: snapshot.serverInfo ? 'pending' : 'approved',
    status: snapshot.serverInfo ? 'running' : 'completed',
    created_at: null,
  };
}

function buildBaselineSnapshot(snapshot) {
  let metadata = snapshot.baselineMetadata;

  if (!metadata) {
    return {
      selected: null,
      selection_reason: 'no_local_baseline_metadata',
      comparison_baseline_build_ids: [],
    };
  }

  return {
    selected: {
      id: metadata.buildId || 'local-baseline',
      name: metadata.buildName || metadata.buildId || 'Local TDD Baseline',
      branch: metadata.branch || 'local',
      commit_sha: metadata.buildInfo?.commitSha || null,
      commit_message: metadata.buildInfo?.commitMessage || null,
      review_state: metadata.buildInfo?.visual_review?.state || 'approved',
      status: metadata.buildInfo?.completedAt ? 'completed' : 'local',
      created_at: metadata.createdAt || null,
      completed_at: metadata.buildInfo?.completedAt || null,
    },
    selection_reason: 'local_workspace_baseline_metadata',
    comparison_baseline_build_ids: metadata.buildId ? [metadata.buildId] : [],
  };
}

function buildReviewState(build, reviewSummary) {
  let reasons = [];

  if (build.review_state === 'pending') {
    reasons.push('build_pending_approval');
  }

  if (reviewSummary.pending > 0) {
    reasons.push('comparisons_need_review');
  }

  return {
    needs_review: reasons.length > 0,
    reasons,
    pending_comparisons: reviewSummary.pending,
    unresolved_comments: 0,
  };
}

function mapLocalComparison(snapshot, comparison) {
  let details = snapshot.comparisonDetails[comparison.id] || {};
  let comparisonName = comparison.originalName || comparison.name;
  let properties = comparison.properties || {};
  let buildSnapshot = buildBuildSnapshot(snapshot);
  let result = mapComparisonResult(comparison.status);
  let reviewState = mapReviewState(comparison.status);
  let baselineBuildId = snapshot.baselineMetadata?.buildId || null;
  let diffImageUrl = resolveAssetReference(comparison.diff, snapshot);
  let diffRegions = details.diffClusters || [];

  return {
    id: comparison.id,
    name: comparisonName,
    screenshot_name: comparisonName,
    status: comparison.status,
    result,
    review_state: reviewState,
    needs_review:
      reviewState === 'pending' && ['changed', 'new'].includes(result),
    build_id: buildSnapshot.id,
    build_name: buildSnapshot.name,
    build_branch: buildSnapshot.branch,
    build_commit_sha: buildSnapshot.commit_sha,
    build_created_at: buildSnapshot.created_at,
    threshold: comparison.threshold ?? null,
    diff_percentage: comparison.diffPercentage ?? null,
    changed_pixels: comparison.diffCount ?? null,
    total_pixels: comparison.totalPixels ?? null,
    screenshot: {
      id: comparison.id,
      name: comparisonName,
      browser: properties.browser ?? null,
      viewport_width: properties.viewport_width ?? null,
      viewport_height: properties.viewport_height ?? null,
      original_url: resolveAssetReference(comparison.current, snapshot),
    },
    baseline: comparison.baseline
      ? {
          id: `${comparison.id}-baseline`,
          build_id: baselineBuildId,
          name: comparisonName,
          browser: properties.browser ?? null,
          viewport_width: properties.viewport_width ?? null,
          viewport_height: properties.viewport_height ?? null,
          original_url: resolveAssetReference(comparison.baseline, snapshot),
        }
      : null,
    diff: {
      percentage: comparison.diffPercentage ?? null,
      changed_pixels: comparison.diffCount ?? null,
      total_pixels: comparison.totalPixels ?? null,
      threshold: comparison.threshold ?? null,
      image_url: diffImageUrl,
      regions: diffRegions,
      cluster_metadata: diffRegions.length
        ? {
            clusterCount: diffRegions.length,
            local_workspace: true,
          }
        : null,
      fingerprint_hash: null,
      fingerprint_data: null,
      diff_lines: [],
    },
    analysis: {
      diff_image_url: diffImageUrl,
      diff_regions: diffRegions,
      cluster_metadata: diffRegions.length
        ? {
            clusterCount: diffRegions.length,
            local_workspace: true,
          }
        : null,
      diff_lines: null,
      fingerprint_hash: null,
      fingerprint_data: null,
    },
  };
}

function formatLocalScreenshot(screenshot, baseline) {
  if (!screenshot) return null;

  return {
    id: screenshot.id,
    name: screenshot.name,
    browser: screenshot.browser,
    viewport: {
      width: screenshot.viewport_width,
      height: screenshot.viewport_height,
    },
    url: screenshot.original_url,
    baseline: baseline
      ? {
          id: baseline.id,
          build_id: baseline.build_id,
          name: baseline.name,
          browser: baseline.browser,
          viewport: {
            width: baseline.viewport_width,
            height: baseline.viewport_height,
          },
          url: baseline.original_url,
        }
      : null,
  };
}

function formatLocalDiff(diff, includeDiffs) {
  let formatted = {
    percentage: diff?.percentage ?? null,
    changed_pixels: diff?.changed_pixels ?? null,
    total_pixels: diff?.total_pixels ?? null,
    threshold: diff?.threshold ?? null,
    image_url: diff?.image_url ?? null,
    fingerprint_hash: diff?.fingerprint_hash ?? null,
    region_count: Array.isArray(diff?.regions) ? diff.regions.length : null,
  };

  if (includeDiffs) {
    formatted.regions = diff?.regions || [];
    formatted.cluster_metadata = diff?.cluster_metadata ?? null;
    formatted.fingerprint_data = diff?.fingerprint_data ?? null;
    formatted.diff_lines = diff?.diff_lines ?? [];
  }

  return formatted;
}

function formatLocalEvidence(comparison, includeDiffs) {
  return {
    type: 'comparison',
    id: comparison.id,
    screenshot_name: comparison.screenshot_name,
    status: comparison.status,
    result: comparison.result,
    review_state: comparison.review_state,
    needs_review: comparison.needs_review,
    build_id: comparison.build_id,
    build_name: comparison.build_name,
    build_branch: comparison.build_branch,
    build_commit_sha: comparison.build_commit_sha,
    build_created_at: comparison.build_created_at,
    screenshot: formatLocalScreenshot(
      comparison.screenshot,
      comparison.baseline
    ),
    diff: formatLocalDiff(comparison.diff, includeDiffs),
  };
}

function formatLocalFocusedComparison(comparison, includeDiffs) {
  if (includeDiffs) return comparison;

  let analysis = comparison.analysis || {};
  let {
    diff_regions: _diffRegions,
    cluster_metadata: _clusterMetadata,
    fingerprint_data: _fingerprintData,
    diff_lines: _diffLines,
    ...summaryAnalysis
  } = analysis;

  return {
    ...comparison,
    diff: formatLocalDiff(comparison.diff, false),
    analysis: summaryAnalysis,
  };
}

function formatLocalHistoryItem(comparison) {
  return {
    id: comparison.id,
    screenshot_name: comparison.screenshot_name,
    result: comparison.result,
    status: comparison.status,
    needs_review: comparison.needs_review,
    build_id: comparison.build_id,
    build_name: comparison.build_name,
    build_branch: comparison.build_branch,
    build_created_at: comparison.build_created_at,
    screenshot: formatLocalScreenshot(
      comparison.screenshot,
      comparison.baseline
    ),
    diff: {
      percentage: comparison.diff?.percentage ?? null,
      fingerprint_hash: comparison.diff?.fingerprint_hash ?? null,
      region_count: Array.isArray(comparison.diff?.regions)
        ? comparison.diff.regions.length
        : null,
    },
  };
}

function compactLocalCollection(items) {
  return {
    total: Array.isArray(items) ? items.length : null,
    included: false,
    details_available: Array.isArray(items) && items.length > 0,
  };
}

function createLocalSnapshotRevision(snapshot) {
  let revisionInput = {
    serverInfo: snapshot.serverInfo,
    reportData: snapshot.reportData,
    comparisonDetails: snapshot.comparisonDetails,
    baselineMetadata: snapshot.baselineMetadata,
  };

  return createHash('sha256')
    .update(JSON.stringify(revisionInput))
    .digest('base64url');
}

function buildReviewSummary(comparisons = []) {
  let approved = comparisons.filter(
    comparison => mapReviewState(comparison.status) === 'approved'
  ).length;
  let rejected = comparisons.filter(
    comparison => mapReviewState(comparison.status) === 'rejected'
  ).length;
  let pending = comparisons.filter(
    comparison => mapReviewState(comparison.status) === 'pending'
  ).length;

  return {
    total: comparisons.length,
    pending,
    approved,
    rejected,
  };
}

function createLocalWorkspaceError(message) {
  let error = new Error(message);
  error.code = 'LOCAL_WORKSPACE_CONTEXT';
  return error;
}

function createReportUrl(snapshot) {
  let reportPath = join(snapshot.vizzlyDir, 'report', 'index.html');

  if (!snapshot.existsSync(reportPath)) {
    return null;
  }

  return pathToFileURL(reportPath).href;
}

export function createLocalWorkspaceContextProvider(options = {}, deps = {}) {
  let projectRoot = options.projectRoot || process.cwd();
  let readJson = deps.readJsonIfExists || readJsonIfExists;
  let existsSync = deps.existsSync || defaultExistsSync;
  let snapshotCache = null;

  function loadSnapshot() {
    if (snapshotCache) {
      return snapshotCache;
    }

    let vizzlyDir = join(projectRoot, '.vizzly');
    snapshotCache = {
      projectRoot,
      vizzlyDir,
      existsSync,
      serverInfo: readJson(join(vizzlyDir, 'server.json')),
      reportData: normalizeReportData(
        readJson(join(vizzlyDir, 'report-data.json')) || createEmptyReportData()
      ),
      comparisonDetails:
        readJson(join(vizzlyDir, 'comparison-details.json')) || {},
      baselineMetadata: readJson(join(vizzlyDir, 'baselines', 'metadata.json')),
    };
    return snapshotCache;
  }

  function isAvailable(snapshot = loadSnapshot()) {
    return Boolean(
      snapshot.serverInfo ||
        snapshot.reportData.comparisons.length > 0 ||
        snapshot.baselineMetadata
    );
  }

  function findComparison(snapshot, target) {
    if (!target) {
      return null;
    }

    return (
      snapshot.reportData.comparisons.find(
        comparison => comparison.id === target
      ) ||
      snapshot.reportData.comparisons.find(
        comparison => comparison.signature === target
      ) ||
      snapshot.reportData.comparisons.find(
        comparison => (comparison.originalName || comparison.name) === target
      ) ||
      null
    );
  }

  function canHandle(command, target, snapshot = loadSnapshot()) {
    if (!isAvailable(snapshot)) {
      return false;
    }

    if (command === 'build') {
      let buildId = buildBuildSnapshot(snapshot).id;
      return target === 'current' || target === 'local' || target === buildId;
    }

    if (command === 'comparison') {
      return Boolean(findComparison(snapshot, target));
    }

    if (command === 'screenshot') {
      return Boolean(
        snapshot.reportData.comparisons.some(
          comparison => (comparison.originalName || comparison.name) === target
        )
      );
    }

    if (command === 'review-queue') {
      return snapshot.reportData.comparisons.length > 0;
    }

    if (command === 'similar') {
      return false;
    }

    return false;
  }

  function createScope() {
    return buildLocalScope(projectRoot);
  }

  function createBuildLinks(snapshot) {
    let reportUrl = createReportUrl(snapshot);

    if (!snapshot.serverInfo?.port) {
      return reportUrl ? { report_url: reportUrl } : {};
    }

    let buildId = buildBuildSnapshot(snapshot).id;

    return {
      build_url: `http://127.0.0.1:${snapshot.serverInfo.port}/builds`,
      comparison_url_prefix: `http://127.0.0.1:${snapshot.serverInfo.port}/comparison`,
      current_build_id: buildId,
      ...(reportUrl ? { report_url: reportUrl } : {}),
    };
  }

  function createLocalCursor(
    resource,
    target,
    query,
    stream,
    offset,
    revision
  ) {
    return Buffer.from(
      JSON.stringify({
        version: 1,
        resource,
        target,
        query,
        stream,
        offset,
        revision,
      })
    ).toString('base64url');
  }

  function readLocalCursor(cursor, resource, target, query, revision, streams) {
    if (!cursor) return null;

    try {
      let parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (
        parsed.version !== 1 ||
        parsed.resource !== resource ||
        parsed.target !== target ||
        parsed.query !== query ||
        parsed.revision !== revision ||
        !streams.includes(parsed.stream) ||
        !Number.isInteger(parsed.offset) ||
        parsed.offset < 0
      ) {
        throw new Error('mismatch');
      }
      return parsed;
    } catch {
      throw createLocalWorkspaceError(
        'The local context cursor is invalid or the local results changed. Start again without --cursor.'
      );
    }
  }

  function createLocalPage(
    items,
    { limit, offset, resource, target, query, stream, revision }
  ) {
    if (offset > items.length) {
      throw createLocalWorkspaceError(
        'The local context cursor is invalid or the local results changed. Start again without --cursor.'
      );
    }

    let pageItems = items.slice(offset, offset + limit);
    let nextOffset = offset + pageItems.length;
    let hasMore = nextOffset < items.length;

    return {
      items: pageItems,
      page: {
        limit,
        returned: pageItems.length,
        total: items.length,
        has_more: hasMore,
        next_cursor: hasMore
          ? createLocalCursor(
              resource,
              target,
              query,
              stream,
              nextOffset,
              revision
            )
          : null,
      },
    };
  }

  function getBuildContext(buildId, query = {}) {
    let snapshot = loadSnapshot();
    let resolvedBuild = buildBuildSnapshot(snapshot);

    if (
      !(
        buildId === 'current' ||
        buildId === 'local' ||
        buildId === resolvedBuild.id
      )
    ) {
      throw createLocalWorkspaceError(
        `Local workspace context is only available for the active local build (${resolvedBuild.id})`
      );
    }

    let mappedComparisons = snapshot.reportData.comparisons.map(comparison =>
      mapLocalComparison(snapshot, comparison)
    );
    let mappedScreenshots = mappedComparisons.map(comparison =>
      formatLocalScreenshot(comparison.screenshot, comparison.baseline)
    );
    let reviewSummary = buildReviewSummary(snapshot.reportData.comparisons);
    let reviewState = buildReviewState(resolvedBuild, reviewSummary);

    let context = {
      resource: 'build_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: createScope(),
      build: resolvedBuild,
      baseline: buildBaselineSnapshot(snapshot),
      status: reviewState,
      summary: {
        comparisons: {
          total: mappedComparisons.length,
          changed: mappedComparisons.filter(
            comparison => comparison.result === 'changed'
          ).length,
          new: mappedComparisons.filter(
            comparison => comparison.result === 'new'
          ).length,
        },
        review: reviewSummary,
        comments: {
          build: 0,
          screenshot: 0,
        },
      },
      review: {
        comments: [],
        assignments: [],
      },
      screenshots: mappedScreenshots,
      comparisons: mappedComparisons,
      comments: {
        build: [],
        screenshot_count: 0,
      },
      links: createBuildLinks(snapshot),
    };

    if (!query.details) return context;

    let revision = createLocalSnapshotRevision(snapshot);
    let limit = query.limit || 10;
    let cursorQuery = `${query.details}:${limit}`;
    let cursor = readLocalCursor(
      query.cursor,
      'build_context',
      resolvedBuild.id,
      cursorQuery,
      revision,
      ['evidence']
    );
    let includeDiffs = query.details === 'diffs';
    let evidence = mappedComparisons.map(comparison =>
      formatLocalEvidence(comparison, includeDiffs)
    );

    return {
      resource: 'build_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: context.scope,
      build: context.build,
      baseline: context.baseline,
      status: context.status,
      summary: context.summary,
      preview: null,
      signature_properties: [],
      evidence: createLocalPage(evidence, {
        limit,
        offset: cursor?.offset || 0,
        resource: 'build_context',
        target: resolvedBuild.id,
        query: cursorQuery,
        stream: 'evidence',
        revision,
      }),
      comments: {
        build: compactLocalCollection(context.comments.build),
        screenshot_count: context.comments.screenshot_count,
      },
      links: context.links,
    };
  }

  function getComparisonContext(comparisonId, query = {}) {
    let snapshot = loadSnapshot();
    let comparison = findComparison(snapshot, comparisonId);

    if (!comparison) {
      throw createLocalWorkspaceError(
        `No local comparison found for "${comparisonId}"`
      );
    }

    let mappedComparison = mapLocalComparison(snapshot, comparison);
    let comparisonName = comparison.originalName || comparison.name;
    let history = snapshot.reportData.comparisons
      .filter(
        candidate =>
          candidate.id !== comparison.id &&
          (candidate.originalName || candidate.name) === comparisonName
      )
      .map(candidate => mapLocalComparison(snapshot, candidate));

    let context = {
      resource: 'comparison_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: createScope(),
      build: buildBuildSnapshot(snapshot),
      comparison: mappedComparison,
      history: {
        similar_by_fingerprint: [],
        recent_by_name: history,
      },
      review: {
        review_summary: {
          total: 0,
          completed: 0,
          pending: 0,
          approved: 0,
          changes_requested: 0,
          commented: 0,
          has_changes_requested: false,
          decisions: [],
        },
        assignments: [],
        build_comments: [],
        screenshot_comments: [],
      },
      links: buildComparisonLinks(snapshot, comparison.id),
    };

    if (!query.details) return context;

    let revision = createLocalSnapshotRevision(snapshot);
    let limit = query.limit || 10;
    let cursorQuery = `${query.details}:${limit}`;
    let cursor = readLocalCursor(
      query.cursor,
      'comparison_context',
      comparison.id,
      cursorQuery,
      revision,
      ['similar_by_fingerprint', 'recent_by_name']
    );
    let activeStream = cursor?.stream;
    let similarOffset =
      activeStream === 'similar_by_fingerprint' ? cursor.offset : 0;
    let recentOffset = activeStream === 'recent_by_name' ? cursor.offset : 0;

    return {
      resource: 'comparison_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: context.scope,
      build: context.build,
      signature_properties: [],
      comparison: formatLocalFocusedComparison(
        context.comparison,
        query.details === 'diffs'
      ),
      history: {
        active_stream: activeStream || null,
        similar_by_fingerprint: createLocalPage([], {
          limit,
          offset: similarOffset,
          resource: 'comparison_context',
          target: comparison.id,
          query: cursorQuery,
          stream: 'similar_by_fingerprint',
          revision,
        }),
        recent_by_name: createLocalPage(history.map(formatLocalHistoryItem), {
          limit,
          offset: recentOffset,
          resource: 'comparison_context',
          target: comparison.id,
          query: cursorQuery,
          stream: 'recent_by_name',
          revision,
        }),
      },
      review: {
        review_summary: context.review.review_summary,
        assignments: compactLocalCollection(context.review.assignments),
        build_comments: compactLocalCollection(context.review.build_comments),
        screenshot_comments: compactLocalCollection(
          context.review.screenshot_comments
        ),
      },
      links: context.links,
      details: query.details,
    };
  }

  function getScreenshotContext(screenshotName) {
    let snapshot = loadSnapshot();
    let matches = snapshot.reportData.comparisons
      .filter(
        comparison =>
          (comparison.originalName || comparison.name) === screenshotName
      )
      .map(comparison => mapLocalComparison(snapshot, comparison));

    if (matches.length === 0) {
      throw createLocalWorkspaceError(
        `No local screenshot context found for "${screenshotName}"`
      );
    }

    return {
      resource: 'screenshot_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: createScope(),
      screenshot: {
        name: screenshotName,
      },
      history: {
        recent_comparisons: matches,
      },
    };
  }

  function getReviewQueueContext(query = {}) {
    let snapshot = loadSnapshot();
    let unresolved = snapshot.reportData.comparisons.filter(
      comparison =>
        comparison.status === 'failed' || comparison.status === 'new'
    );
    let offset = query.offset || 0;
    let limit = query.limit || DEFAULT_LOCAL_REVIEW_QUEUE_LIMIT;
    let visible = unresolved
      .slice(offset, offset + limit)
      .map(comparison => mapLocalComparison(snapshot, comparison));

    return {
      resource: 'review_queue_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: createScope(),
      summary: {
        total: unresolved.length,
        changed: unresolved.filter(comparison => comparison.status === 'failed')
          .length,
        new: unresolved.filter(comparison => comparison.status === 'new')
          .length,
        builds: unresolved.length > 0 ? 1 : 0,
      },
      comparisons: visible,
    };
  }

  function getSimilarFingerprintContext() {
    throw createLocalWorkspaceError(
      'Local workspace context does not support fingerprint similarity yet. Use --source cloud for this query.'
    );
  }

  return {
    source: LOCAL_CONTEXT_SOURCE,
    loadSnapshot,
    isAvailable,
    canHandle,
    getBuildContext,
    getComparisonContext,
    getScreenshotContext,
    getReviewQueueContext,
    getSimilarFingerprintContext,
  };
}
