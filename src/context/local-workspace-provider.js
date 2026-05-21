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

function mapApprovalStatus(status) {
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

function normalizeConfirmedRegions(regions = []) {
  return regions.map((region, index) => ({
    id: region.id || `local-region-${index}`,
    x1: region.x1 ?? region.x ?? null,
    y1: region.y1 ?? region.y ?? null,
    x2:
      region.x2 ??
      (region.x != null && region.width != null
        ? region.x + region.width
        : null),
    y2:
      region.y2 ??
      (region.y != null && region.height != null
        ? region.y + region.height
        : null),
    label: region.label || null,
  }));
}

function mergeConfirmedRegions(snapshot, comparisonName, details = {}) {
  let workspaceRegions = snapshot.regions?.[comparisonName]?.confirmed || [];
  let detailRegions = details.confirmedRegions || [];
  let merged = [...workspaceRegions, ...detailRegions];
  let seen = new Set();

  return normalizeConfirmedRegions(merged).filter(region => {
    let key = `${region.label || ''}:${region.x1}:${region.y1}:${region.x2}:${region.y2}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildHotspotAnalysis(snapshot, comparisonName, details = {}) {
  let hotspotMetadata = snapshot.hotspots?.[comparisonName] || null;
  let hotspotAnalysis = details.hotspotAnalysis || null;

  if (!hotspotMetadata && !hotspotAnalysis) {
    return {
      regions: [],
      total_builds_analyzed: 0,
      confidence: 'no_data',
      confidence_score: null,
      data_source: 'local_workspace',
    };
  }

  return {
    regions: hotspotMetadata?.regions || [],
    total_builds_analyzed: 1,
    confidence:
      hotspotAnalysis?.confidence || hotspotMetadata?.confidence || 'workspace',
    confidence_score: hotspotAnalysis?.confidenceScore || null,
    data_source: 'local_workspace',
  };
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

function buildBuildSnapshot(snapshot) {
  let buildId =
    snapshot.session?.buildId ||
    snapshot.serverInfo?.buildId ||
    'local-workspace';

  return {
    id: buildId,
    name: buildId,
    branch: snapshot.session?.branch || 'local',
    commit_sha: snapshot.session?.commit || null,
    commit_message: null,
    approval_status: snapshot.serverInfo ? 'pending' : 'approved',
    status: snapshot.serverInfo ? 'running' : 'completed',
    created_at: snapshot.session?.createdAt || null,
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
      approval_status: metadata.buildInfo?.approvalStatus || 'approved',
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

  if (build.approval_status === 'pending') {
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

function mapLocalScreenshot(snapshot, comparison) {
  let mapped = mapLocalComparison(snapshot, comparison);
  let baselineBuildId = snapshot.baselineMetadata?.buildId || null;

  return {
    id: mapped.screenshot.id,
    name: mapped.screenshot.name,
    browser: mapped.screenshot.browser,
    viewport: {
      width: mapped.screenshot.viewport_width,
      height: mapped.screenshot.viewport_height,
    },
    url: mapped.screenshot.original_url,
    baseline: mapped.baseline
      ? {
          id: mapped.baseline.id,
          build_id: baselineBuildId,
          name: mapped.baseline.name,
          browser: mapped.baseline.browser,
          viewport: {
            width: mapped.baseline.viewport_width,
            height: mapped.baseline.viewport_height,
          },
          url: mapped.baseline.original_url,
        }
      : null,
  };
}

function mapLocalComparison(snapshot, comparison) {
  let details = snapshot.comparisonDetails[comparison.id] || {};
  let comparisonName = comparison.originalName || comparison.name;
  let confirmedRegions = mergeConfirmedRegions(
    snapshot,
    comparisonName,
    details
  );
  let hotspotAnalysis = buildHotspotAnalysis(snapshot, comparisonName, details);
  let properties = comparison.properties || {};
  let buildSnapshot = buildBuildSnapshot(snapshot);
  let result = mapComparisonResult(comparison.status);
  let approvalStatus = mapApprovalStatus(comparison.status);
  let baselineBuildId = snapshot.baselineMetadata?.buildId || null;
  let diffImageUrl = resolveAssetReference(comparison.diff, snapshot);
  let diffRegions = details.diffClusters || [];

  return {
    id: comparison.id,
    name: comparisonName,
    screenshot_name: comparisonName,
    status: comparison.status,
    result,
    approval_status: approvalStatus,
    needs_review:
      approvalStatus === 'pending' && ['changed', 'new'].includes(result),
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
      hotspot_analysis: hotspotAnalysis,
      region_analysis: details.regionAnalysis || null,
      confirmed_regions: confirmedRegions,
    },
  };
}

function buildReviewSummary(comparisons = []) {
  let approved = comparisons.filter(
    comparison => mapApprovalStatus(comparison.status) === 'approved'
  ).length;
  let rejected = comparisons.filter(
    comparison => mapApprovalStatus(comparison.status) === 'rejected'
  ).length;
  let pending = comparisons.filter(
    comparison => mapApprovalStatus(comparison.status) === 'pending'
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
      session: readJson(join(vizzlyDir, 'session.json')),
      reportData: normalizeReportData(
        readJson(join(vizzlyDir, 'report-data.json')) || createEmptyReportData()
      ),
      comparisonDetails:
        readJson(join(vizzlyDir, 'comparison-details.json')) || {},
      baselineMetadata: readJson(join(vizzlyDir, 'baselines', 'metadata.json')),
      hotspotFile: readJson(join(vizzlyDir, 'hotspots.json')),
      regionFile: readJson(join(vizzlyDir, 'regions.json')),
    };

    snapshotCache.hotspots = snapshotCache.hotspotFile?.hotspots || null;
    snapshotCache.regions = snapshotCache.regionFile?.regions || null;
    return snapshotCache;
  }

  function isAvailable(snapshot = loadSnapshot()) {
    return Boolean(
      snapshot.serverInfo ||
        snapshot.session ||
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
        ) ||
          snapshot.regions?.[target] ||
          snapshot.hotspots?.[target]
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

  function getBuildContext(buildId) {
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
        `Local workspace context is only available for the active session build (${resolvedBuild.id})`
      );
    }

    let mappedComparisons = snapshot.reportData.comparisons.map(comparison =>
      mapLocalComparison(snapshot, comparison)
    );
    let mappedScreenshots = snapshot.reportData.comparisons.map(comparison =>
      mapLocalScreenshot(snapshot, comparison)
    );
    let reviewSummary = buildReviewSummary(snapshot.reportData.comparisons);
    let reviewState = buildReviewState(resolvedBuild, reviewSummary);

    return {
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
  }

  function getComparisonContext(comparisonId) {
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

    return {
      resource: 'comparison_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: createScope(),
      build: buildBuildSnapshot(snapshot),
      comparison: mappedComparison,
      history: {
        similar_by_fingerprint: [],
        recent_by_name: history,
        hotspot_analysis: buildHotspotAnalysis(
          snapshot,
          comparisonName,
          snapshot.comparisonDetails[comparison.id] || {}
        ),
        confirmed_regions: mergeConfirmedRegions(
          snapshot,
          comparisonName,
          snapshot.comparisonDetails[comparison.id] || {}
        ),
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
  }

  function getScreenshotContext(screenshotName) {
    let snapshot = loadSnapshot();
    let matches = snapshot.reportData.comparisons
      .filter(
        comparison =>
          (comparison.originalName || comparison.name) === screenshotName
      )
      .map(comparison => mapLocalComparison(snapshot, comparison));

    if (
      matches.length === 0 &&
      !snapshot.regions?.[screenshotName] &&
      !snapshot.hotspots?.[screenshotName]
    ) {
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
      hotspot_analysis: buildHotspotAnalysis(snapshot, screenshotName),
      confirmed_regions: mergeConfirmedRegions(snapshot, screenshotName),
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
