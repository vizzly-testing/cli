function parseNumberValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  let parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getComparisonName(comparison = {}) {
  return (
    comparison.name ||
    comparison.screenshot_name ||
    comparison.screenshot?.name ||
    comparison.current_name ||
    comparison.id ||
    'unknown screenshot'
  );
}

function getComparisonResult(comparison = {}) {
  return comparison.result || comparison.status || 'unknown';
}

function getComparisonBrowser(comparison = {}) {
  return (
    comparison.browser ||
    comparison.screenshot?.browser ||
    comparison.current_browser ||
    comparison.metadata?.browser ||
    comparison.current_metadata?.browser ||
    comparison.current_metadata?.properties?.browser ||
    null
  );
}

function getComparisonViewport(comparison = {}) {
  let viewport = comparison.viewport || {};
  let screenshot = comparison.screenshot || {};
  let width =
    viewport.width ||
    screenshot.viewport_width ||
    comparison.viewport_width ||
    comparison.current_viewport_width ||
    comparison.current_width ||
    null;
  let height =
    viewport.height ||
    screenshot.viewport_height ||
    comparison.viewport_height ||
    comparison.current_viewport_height ||
    comparison.current_height ||
    null;

  return {
    width,
    height,
    display:
      viewport.display || (width && height ? `${width}×${height}` : null),
  };
}

function getComparisonDiff(comparison = {}, options = {}) {
  let { includeDetails = false } = options;
  let diff = comparison.diff || comparison.analysis || {};
  let regions = diff.regions || diff.diff_regions || [];
  let compactDiff = {
    percentage: parseNumberValue(diff.percentage ?? comparison.diff_percentage),
    changed_pixels: diff.changed_pixels ?? comparison.changed_pixels ?? null,
    total_pixels: diff.total_pixels ?? comparison.total_pixels ?? null,
    threshold: diff.threshold ?? comparison.threshold ?? null,
    fingerprint_hash:
      diff.fingerprint_hash ||
      comparison.fingerprint_hash ||
      comparison.analysis?.fingerprint_hash ||
      null,
    image_url: diff.image_url || comparison.analysis?.diff_image_url || null,
    region_count:
      diff.region_count ?? (Array.isArray(regions) ? regions.length : 0),
  };

  if (!includeDetails) {
    return compactDiff;
  }

  return {
    ...compactDiff,
    regions,
    cluster_metadata: diff.cluster_metadata || null,
    ssim_score: diff.ssim_score ?? null,
    gmsd_score: diff.gmsd_score ?? null,
    diff_lines: diff.diff_lines || [],
  };
}

function getVariantArea(comparison = {}) {
  let viewport = getComparisonViewport(comparison);
  return (
    (parseNumberValue(viewport.width) || 0) *
    (parseNumberValue(viewport.height) || 0)
  );
}

function sortVariants(comparisons = []) {
  return [...comparisons].sort((a, b) => {
    let areaDifference = getVariantArea(b) - getVariantArea(a);

    if (areaDifference !== 0) {
      return areaDifference;
    }

    let browserComparison = (getComparisonBrowser(a) || '').localeCompare(
      getComparisonBrowser(b) || ''
    );

    if (browserComparison !== 0) {
      return browserComparison;
    }

    return getComparisonName(a).localeCompare(getComparisonName(b));
  });
}

function selectPrimaryVariant(comparisons = []) {
  let desktopChrome = comparisons.find(comparison => {
    let width = parseNumberValue(getComparisonViewport(comparison).width) || 0;
    return getComparisonBrowser(comparison) === 'chrome' && width >= 1200;
  });

  return desktopChrome || comparisons[0] || null;
}

export function normalizeComparisonRecord(comparison = {}, options = {}) {
  let screenshot = comparison.screenshot || {};
  let baseline = comparison.baseline || screenshot.baseline || {};
  let diff = getComparisonDiff(comparison, options);

  return {
    id: comparison.id || null,
    name: getComparisonName(comparison),
    result: getComparisonResult(comparison),
    status: comparison.status || null,
    approval_status: comparison.approval_status || null,
    needs_review: Boolean(comparison.needs_review),
    is_flaky: Boolean(comparison.is_flaky),
    browser: getComparisonBrowser(comparison),
    viewport: getComparisonViewport(comparison),
    screenshot: {
      id: screenshot.id || comparison.current_screenshot_id || null,
      url:
        screenshot.url ||
        screenshot.original_url ||
        comparison.current_original_url ||
        null,
    },
    baseline: {
      id: baseline.id || comparison.baseline_screenshot_id || null,
      build_id: baseline.build_id || comparison.baseline_build_id || null,
      url:
        baseline.url ||
        baseline.original_url ||
        comparison.baseline_original_url ||
        null,
      name: baseline.name || comparison.baseline_name || null,
    },
    diff,
  };
}

export function groupComparisonsByScreenshot(comparisons = [], options = {}) {
  let groups = new Map();

  for (let comparison of comparisons) {
    let normalized = normalizeComparisonRecord(comparison, options);

    if (!groups.has(normalized.name)) {
      groups.set(normalized.name, {
        name: normalized.name,
        variants: [],
      });
    }

    groups.get(normalized.name).variants.push(normalized);
  }

  return Array.from(groups.values()).map(group =>
    normalizeComparisonGroup(group, options)
  );
}

export function normalizeComparisonGroup(group = {}, options = {}) {
  let rawVariants = group.variants || group.comparisons || [];
  let variants = sortVariants(
    rawVariants.map(variant => normalizeComparisonRecord(variant, options))
  );
  let primaryVariant = group.primary_variant
    ? normalizeComparisonRecord(group.primary_variant, options)
    : selectPrimaryVariant(variants);
  let aggregate = group.aggregate_status || {};
  let maxDiffPercentage = Math.max(
    0,
    ...variants.map(variant => parseNumberValue(variant.diff.percentage) || 0)
  );
  let hasChanges =
    aggregate.has_changes ??
    variants.some(
      variant =>
        variant.result === 'changed' || (variant.diff.percentage || 0) > 0
    );
  let hasNew =
    aggregate.has_new ?? variants.some(variant => variant.result === 'new');
  let hasRejected =
    aggregate.has_rejected ??
    variants.some(variant => variant.approval_status === 'rejected');
  let hasFlaky =
    aggregate.has_flaky ?? variants.some(variant => variant.is_flaky);
  let allApproved =
    aggregate.all_approved ??
    (variants.length > 0 &&
      variants.every(variant => variant.approval_status === 'approved'));

  return {
    name:
      group.name ||
      group.test_name ||
      primaryVariant?.name ||
      'unknown screenshot',
    variant_count: group.variant_count ?? variants.length,
    browsers: group.browsers || [
      ...new Set(variants.map(variant => variant.browser).filter(Boolean)),
    ],
    viewports: group.viewports || [
      ...new Set(
        variants.map(variant => variant.viewport.display).filter(Boolean)
      ),
    ],
    primary_variant: primaryVariant,
    variants,
    aggregate_status: {
      has_changes: hasChanges,
      has_new: hasNew,
      all_approved: allApproved,
      has_rejected: hasRejected,
      has_flaky: hasFlaky,
      max_diff_percentage: aggregate.max_diff_percentage ?? maxDiffPercentage,
      status_priority:
        aggregate.status_priority ??
        (hasRejected ? 4 : hasFlaky ? 3 : hasChanges ? 2 : hasNew ? 1 : 0),
    },
    comment_count: group.comment_count || 0,
  };
}

export function normalizeBuildContext(context = {}, options = {}) {
  let comparisons = context.comparisons || [];
  let groups =
    Array.isArray(context.groups) && context.groups.length > 0
      ? context.groups.map(group => normalizeComparisonGroup(group, options))
      : groupComparisonsByScreenshot(comparisons, options);

  return {
    ...context,
    comparisons: comparisons.map(comparison =>
      normalizeComparisonRecord(comparison, options)
    ),
    groups,
  };
}

export function summarizeComparisonGroups(groups = []) {
  return {
    total: groups.length,
    changed: groups.filter(group => group.aggregate_status.has_changes).length,
    new: groups.filter(group => group.aggregate_status.has_new).length,
    rejected: groups.filter(group => group.aggregate_status.has_rejected)
      .length,
    flaky: groups.filter(group => group.aggregate_status.has_flaky).length,
    max_diff_percentage: Math.max(
      0,
      ...groups.map(group => group.aggregate_status.max_diff_percentage || 0)
    ),
  };
}
