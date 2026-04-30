import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { normalizeReportData } from '../reporter/src/utils/report-data.js';

let LOCAL_CONTEXT_SOURCE = 'local_workspace';
let DEFAULT_LOCAL_REVIEW_QUEUE_LIMIT = 50;

function readJsonIfExists(path) {
  if (!existsSync(path)) {
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

  if (/^https?:\/\//.test(assetPath) || isAbsolute(assetPath)) {
    return assetPath;
  }

  if (assetPath.startsWith('/images/')) {
    if (snapshot.serverInfo?.port) {
      return `http://127.0.0.1:${snapshot.serverInfo.port}${assetPath}`;
    }

    return join(snapshot.vizzlyDir, assetPath.replace('/images/', ''));
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

  return {
    id: comparison.id,
    name: comparisonName,
    status: comparison.status,
    result: mapComparisonResult(comparison.status),
    approval_status: mapApprovalStatus(comparison.status),
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
          name: comparisonName,
          browser: properties.browser ?? null,
          viewport_width: properties.viewport_width ?? null,
          viewport_height: properties.viewport_height ?? null,
          original_url: resolveAssetReference(comparison.baseline, snapshot),
        }
      : null,
    analysis: {
      diff_image_url: resolveAssetReference(comparison.diff, snapshot),
      diff_regions: details.diffClusters || [],
      cluster_metadata: details.diffClusters
        ? {
            clusterCount: details.diffClusters.length,
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

export function createLocalWorkspaceContextProvider(options = {}, deps = {}) {
  let projectRoot = options.projectRoot || process.cwd();
  let readJson = deps.readJsonIfExists || readJsonIfExists;
  let snapshotCache = null;

  function loadSnapshot() {
    if (snapshotCache) {
      return snapshotCache;
    }

    let vizzlyDir = join(projectRoot, '.vizzly');
    snapshotCache = {
      projectRoot,
      vizzlyDir,
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
    if (!snapshot.serverInfo?.port) {
      return {};
    }

    let buildId = buildBuildSnapshot(snapshot).id;

    return {
      build_url: `http://127.0.0.1:${snapshot.serverInfo.port}/builds`,
      comparison_url_prefix: `http://127.0.0.1:${snapshot.serverInfo.port}/comparison`,
      current_build_id: buildId,
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
    let reviewSummary = buildReviewSummary(snapshot.reportData.comparisons);

    return {
      resource: 'build_context',
      source: LOCAL_CONTEXT_SOURCE,
      scope: createScope(),
      build: resolvedBuild,
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
      },
      review: {
        comments: [],
        assignments: [],
      },
      comparisons: mappedComparisons,
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
