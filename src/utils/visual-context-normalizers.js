export function getVisualReviewState(record = {}) {
  return (
    record.visual_review?.state ||
    record.review_state ||
    record.approval_status ||
    null
  );
}

export function getComparisonResult(comparison = {}) {
  return comparison.result || comparison.status || null;
}

export function getComparisonName(comparison = {}) {
  return (
    comparison.name ||
    comparison.screenshot_name ||
    comparison.current_screenshot?.name ||
    comparison.screenshot?.name ||
    comparison.current_name ||
    comparison.id ||
    null
  );
}

export function getComparisonViewport(comparison = {}) {
  let current = comparison.current_screenshot || comparison.screenshot || {};
  let viewport = comparison.viewport || current.viewport || {};
  let width =
    viewport.width ??
    comparison.viewport_width ??
    current.viewport_width ??
    comparison.current_viewport_width ??
    null;
  let height =
    viewport.height ??
    comparison.viewport_height ??
    current.viewport_height ??
    comparison.current_viewport_height ??
    null;

  return width != null || height != null ? { width, height } : null;
}

export function getComparisonBrowser(comparison = {}) {
  return (
    comparison.browser ||
    comparison.current_screenshot?.browser ||
    comparison.screenshot?.browser ||
    comparison.current_browser ||
    comparison.current_metadata?.browser ||
    comparison.current_metadata?.properties?.browser ||
    null
  );
}

function getBitmap(record = {}, fallback = {}) {
  let bitmap = record.bitmap || fallback.bitmap || {};
  let width =
    bitmap.width ?? record.bitmap_width ?? fallback.bitmap_width ?? null;
  let height =
    bitmap.height ?? record.bitmap_height ?? fallback.bitmap_height ?? null;

  return width != null || height != null ? { width, height } : null;
}

function getRecordViewport(record = {}, fallback = {}) {
  let viewport = record.viewport || fallback.viewport || {};
  let width =
    viewport.width ?? record.viewport_width ?? fallback.viewport_width ?? null;
  let height =
    viewport.height ??
    record.viewport_height ??
    fallback.viewport_height ??
    null;

  return width != null || height != null ? { width, height } : null;
}

function getCurrentScreenshot(comparison = {}) {
  let screenshot = comparison.current_screenshot || comparison.screenshot || {};

  return {
    id: screenshot.id || comparison.current_screenshot_id || null,
    name: screenshot.name || getComparisonName(comparison),
    status: screenshot.status || comparison.screenshot_status || null,
    browser: screenshot.browser || getComparisonBrowser(comparison),
    device: screenshot.device || comparison.device || null,
    viewport:
      getRecordViewport(screenshot, {
        viewport: comparison.viewport,
        viewport_width:
          comparison.current_viewport_width ?? comparison.viewport_width,
        viewport_height:
          comparison.current_viewport_height ?? comparison.viewport_height,
      }) || getComparisonViewport(comparison),
    bitmap: getBitmap(screenshot, {
      bitmap: comparison.bitmap,
      bitmap_width: comparison.current_width ?? comparison.bitmap_width,
      bitmap_height: comparison.current_height ?? comparison.bitmap_height,
    }),
    metadata:
      screenshot.metadata ||
      comparison.current_metadata ||
      comparison.metadata ||
      null,
    signature:
      screenshot.signature ||
      comparison.current_signature ||
      comparison.signature ||
      null,
    url:
      screenshot.url ||
      screenshot.original_url ||
      comparison.current_url ||
      comparison.current_original_url ||
      comparison.current_screenshot_url ||
      null,
    error_message: screenshot.error_message || comparison.error_message || null,
  };
}

function getBaselineScreenshot(comparison = {}) {
  let current = comparison.current_screenshot || comparison.screenshot || {};
  let baseline =
    comparison.baseline_screenshot ||
    comparison.baseline ||
    current.baseline ||
    {};

  return {
    id: baseline.id || comparison.baseline_screenshot_id || null,
    build_id: baseline.build_id || comparison.baseline_build_id || null,
    name: baseline.name || comparison.baseline_name || null,
    browser: baseline.browser || null,
    viewport: getRecordViewport(baseline),
    bitmap: getBitmap(baseline),
    metadata: baseline.metadata || comparison.baseline_metadata || null,
    signature: baseline.signature || comparison.baseline_signature || null,
    url:
      baseline.url ||
      baseline.original_url ||
      comparison.baseline_url ||
      comparison.baseline_original_url ||
      comparison.baseline_screenshot_url ||
      null,
  };
}

function getComparisonDiff(comparison = {}) {
  let diff =
    comparison.diff || comparison.diff_image || comparison.analysis || {};
  let regions = diff.regions || diff.diff_regions || comparison.diff_regions;
  let projection =
    diff.projection ||
    diff.analysis_projection ||
    comparison.analysis_projection ||
    comparison.projection ||
    null;

  return {
    percentage: diff.percentage ?? comparison.diff_percentage ?? null,
    changed_pixels: diff.changed_pixels ?? comparison.changed_pixels ?? null,
    total_pixels: diff.total_pixels ?? comparison.total_pixels ?? null,
    threshold: diff.threshold ?? comparison.threshold ?? null,
    fingerprint_hash:
      diff.fingerprint_hash || comparison.fingerprint_hash || null,
    region_count:
      diff.region_count ??
      comparison.region_count ??
      projection?.clusters?.count ??
      (Array.isArray(regions) ? regions.length : null),
    projection,
    image_url:
      diff.image_url ||
      diff.url ||
      comparison.diff_url ||
      comparison.diff_image_url ||
      null,
  };
}

function comparisonNeedsReview(comparison = {}, reviewState = null) {
  if (comparison.needs_review != null) {
    return comparison.needs_review === true;
  }

  if (reviewState == null) {
    return null;
  }

  return reviewState === 'pending';
}

export function normalizeComparisonRecord(comparison = {}, options = {}) {
  let reviewState = getVisualReviewState(comparison);
  let name =
    comparison.name ||
    comparison.screenshot_name ||
    comparison.current_screenshot?.name ||
    comparison.screenshot?.name ||
    comparison.current_name ||
    options.fallbackName ||
    comparison.id ||
    null;

  return {
    id: comparison.id || null,
    name,
    result: getComparisonResult(comparison),
    status: comparison.status || null,
    review_state: reviewState,
    visual_review: comparison.visual_review || null,
    approval_status: comparison.approval_status || null,
    build_branch: comparison.build_branch || null,
    needs_review: comparisonNeedsReview(comparison, reviewState),
    is_flaky: comparison.is_flaky == null ? null : comparison.is_flaky === true,
    browser: getComparisonBrowser(comparison),
    viewport: getComparisonViewport(comparison),
    screenshot: getCurrentScreenshot(comparison),
    baseline: getBaselineScreenshot(comparison),
    diff: getComparisonDiff(comparison),
  };
}

function getExplicitVariantCount(group = {}) {
  return (
    group.variant_count ?? group.total_variants ?? group.totalVariants ?? null
  );
}

function hasCompleteVariants(
  group = {},
  variants = [],
  forcedComplete = false
) {
  if (forcedComplete || group.variants_complete === true) {
    return true;
  }

  let explicitCount = getExplicitVariantCount(group);
  return explicitCount != null && explicitCount === variants.length;
}

function deriveAggregateFacts(variants = [], complete = false) {
  if (!complete) {
    return {};
  }

  let results = variants.map(variant => variant.result);
  let reviewStates = variants.map(variant => variant.review_state);
  let needsReview = variants.map(variant => variant.needs_review);
  let flaky = variants.map(variant => variant.is_flaky);
  let percentages = variants
    .map(variant => variant.diff.percentage)
    .filter(value => value != null);
  let allResultsKnown = results.every(value => value != null);
  let allReviewStatesKnown = reviewStates.every(value => value != null);
  let allNeedsReviewKnown = needsReview.every(value => value != null);
  let allFlakyKnown = flaky.every(value => value != null);

  return {
    has_changes: results.includes('changed')
      ? true
      : allResultsKnown
        ? false
        : null,
    has_new: results.includes('new') ? true : allResultsKnown ? false : null,
    all_approved:
      variants.length > 0 && allReviewStatesKnown
        ? reviewStates.every(state => state === 'approved')
        : null,
    needs_review: allNeedsReviewKnown
      ? needsReview.some(value => value === true)
      : null,
    needs_review_count: allNeedsReviewKnown
      ? needsReview.filter(value => value === true).length
      : null,
    failed_count: allResultsKnown
      ? results.filter(result => ['failed', 'error'].includes(result)).length
      : null,
    has_rejected: reviewStates.includes('rejected')
      ? true
      : allReviewStatesKnown
        ? false
        : null,
    has_flaky: flaky.includes(true) ? true : allFlakyKnown ? false : null,
    max_diff_percentage:
      percentages.length === variants.length && percentages.length > 0
        ? Math.max(...percentages)
        : null,
  };
}

export function normalizeComparisonGroup(group = {}, options = {}) {
  let rawVariants = group.variants || group.comparisons || [];
  let groupName = group.name || group.test_name || group.testName || null;
  let variants = rawVariants.map(variant =>
    normalizeComparisonRecord(variant, { fallbackName: groupName })
  );
  let complete = hasCompleteVariants(
    group,
    variants,
    options.variantsComplete === true
  );
  let derived = deriveAggregateFacts(variants, complete);
  let aggregate = group.aggregate_status || {};
  let needsReviewCount =
    aggregate.needs_review_count ?? derived.needs_review_count ?? null;

  return {
    name: groupName || variants[0]?.name || 'unknown screenshot',
    variant_count:
      getExplicitVariantCount(group) ?? (complete ? variants.length : null),
    variants_complete: complete,
    variants,
    aggregate_status: {
      has_changes: aggregate.has_changes ?? derived.has_changes ?? null,
      has_new: aggregate.has_new ?? derived.has_new ?? null,
      all_approved: aggregate.all_approved ?? derived.all_approved ?? null,
      needs_review:
        aggregate.needs_review ??
        (aggregate.needs_review_count != null
          ? aggregate.needs_review_count > 0
          : (derived.needs_review ?? null)),
      needs_review_count: needsReviewCount,
      failed_count: aggregate.failed_count ?? derived.failed_count ?? null,
      has_rejected: aggregate.has_rejected ?? derived.has_rejected ?? null,
      has_flaky: aggregate.has_flaky ?? derived.has_flaky ?? null,
      max_diff_percentage:
        aggregate.max_diff_percentage ?? derived.max_diff_percentage ?? null,
    },
  };
}

function groupFlatComparisons(comparisons = []) {
  let grouped = new Map();

  for (let comparison of comparisons) {
    let name = getComparisonName(comparison) || 'unknown screenshot';
    let group = grouped.get(name) || { name, variants: [] };
    group.variants.push(comparison);
    grouped.set(name, group);
  }

  return [...grouped.values()].map(group =>
    normalizeComparisonGroup(group, { variantsComplete: true })
  );
}

function normalizeFailedCapture(screenshot = {}) {
  let normalized = normalizeComparisonRecord({
    ...screenshot,
    screenshot,
    result: screenshot.result || screenshot.status || 'failed',
  });

  return {
    ...normalized,
    error_message:
      screenshot.error_message || normalized.screenshot.error_message || null,
  };
}

function getFailedCaptures(context = {}) {
  let explicit = Array.isArray(context.failed_captures)
    ? context.failed_captures
    : Array.isArray(context.failed_screenshots)
      ? context.failed_screenshots
      : [];
  let screenshots = (context.screenshots || []).filter(screenshot =>
    ['failed', 'error'].includes(screenshot.status)
  );
  let captures = [...explicit, ...screenshots];
  let seen = new Set();

  return captures.map(normalizeFailedCapture).filter(capture => {
    let key = capture.id || capture.screenshot.signature || capture.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function normalizeBuildContext(context = {}) {
  let rawComparisons = context.comparisons || [];
  let comparisons = rawComparisons.map(comparison =>
    normalizeComparisonRecord(comparison)
  );
  let groups =
    Array.isArray(context.groups) && context.groups.length > 0
      ? context.groups.map(group => normalizeComparisonGroup(group))
      : groupFlatComparisons(rawComparisons);

  return {
    ...context,
    comparisons,
    groups,
    failed_captures: getFailedCaptures(context),
  };
}
