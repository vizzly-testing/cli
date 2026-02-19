export function parseJson(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function hasReportData(reportData) {
  if (!reportData || typeof reportData !== 'object') {
    return false;
  }

  if (!Array.isArray(reportData.comparisons)) {
    return false;
  }

  return true;
}

export function buildSummary(comparisons) {
  return {
    total: comparisons.length,
    passed: comparisons.filter(
      comparison =>
        comparison.status === 'passed' ||
        comparison.status === 'baseline-created' ||
        comparison.status === 'new'
    ).length,
    failed: comparisons.filter(comparison => comparison.status === 'failed')
      .length,
    rejected: comparisons.filter(comparison => comparison.status === 'rejected')
      .length,
    errors: comparisons.filter(comparison => comparison.status === 'error')
      .length,
  };
}

export function mapComparisonRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    initialStatus: row.initial_status,
    signature: row.signature,
    baseline: row.baseline,
    current: row.current,
    diff: row.diff,
    properties: parseJson(row.properties_json, {}),
    threshold: row.threshold,
    minClusterSize: row.min_cluster_size,
    diffPercentage: row.diff_percentage,
    diffCount: row.diff_count,
    reason: row.reason,
    totalPixels: row.total_pixels,
    aaPixelsIgnored: row.aa_pixels_ignored,
    aaPercentage: row.aa_percentage,
    heightDiff: row.height_diff,
    error: row.error,
    originalName: row.original_name,
    timestamp: row.timestamp,
    hasDiffClusters: Boolean(row.has_diff_clusters),
    hasConfirmedRegions: Boolean(row.has_confirmed_regions),
  };
}

export function normalizeComparison(comparison, initialStatus) {
  let normalized = comparison || {};
  let now = Date.now();

  return {
    id: normalized.id,
    name: normalized.name,
    status: normalized.status,
    initial_status:
      initialStatus ||
      normalized.initialStatus ||
      normalized.initial_status ||
      normalized.status ||
      null,
    signature: normalized.signature ?? null,
    baseline: normalized.baseline ?? null,
    current: normalized.current ?? null,
    diff: normalized.diff ?? null,
    properties_json: JSON.stringify(normalized.properties || {}),
    threshold:
      normalized.threshold == null ? null : Number(normalized.threshold),
    min_cluster_size:
      normalized.minClusterSize == null
        ? null
        : Number(normalized.minClusterSize),
    diff_percentage:
      normalized.diffPercentage == null
        ? null
        : Number(normalized.diffPercentage),
    diff_count:
      normalized.diffCount == null ? null : Number(normalized.diffCount),
    reason: normalized.reason ?? null,
    total_pixels:
      normalized.totalPixels == null ? null : Number(normalized.totalPixels),
    aa_pixels_ignored:
      normalized.aaPixelsIgnored == null
        ? null
        : Number(normalized.aaPixelsIgnored),
    aa_percentage:
      normalized.aaPercentage == null ? null : Number(normalized.aaPercentage),
    height_diff:
      normalized.heightDiff == null ? null : Number(normalized.heightDiff),
    error: normalized.error ?? null,
    original_name: normalized.originalName ?? null,
    has_diff_clusters: Number(Boolean(normalized.hasDiffClusters)),
    has_confirmed_regions: Number(Boolean(normalized.hasConfirmedRegions)),
    timestamp:
      normalized.timestamp == null ? now : Number(normalized.timestamp),
    updated_at: now,
  };
}

export function normalizeHotspotBundle(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.hotspots && typeof value.hotspots === 'object') {
    return {
      downloadedAt: value.downloadedAt || new Date().toISOString(),
      summary: value.summary || {},
      hotspots: value.hotspots,
    };
  }

  return {
    downloadedAt: new Date().toISOString(),
    summary: {},
    hotspots: value,
  };
}

export function normalizeRegionBundle(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.regions && typeof value.regions === 'object') {
    return {
      downloadedAt: value.downloadedAt || new Date().toISOString(),
      summary: value.summary || {},
      regions: value.regions,
    };
  }

  return {
    downloadedAt: new Date().toISOString(),
    summary: {},
    regions: value,
  };
}
