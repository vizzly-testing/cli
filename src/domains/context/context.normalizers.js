/**
 * Read the API's visual-review state.
 *
 * @param {Object} record - Comparison or review record from the API.
 * @returns {string|null} The review state when the API supplied one.
 */
export function getVisualReviewState(record = {}) {
  return record.visual_review?.state || null;
}

/**
 * Read the visual comparison result.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {string|null} The visual result when the API supplied one.
 */
export function getComparisonResult(comparison = {}) {
  return comparison.result || null;
}

/**
 * Read the current screenshot name.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {string|null} The screenshot name when the API supplied one.
 */
export function getComparisonName(comparison = {}) {
  return comparison.screenshot?.name || null;
}

/**
 * Read CSS viewport dimensions without confusing them with bitmap size.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {{width: number|null, height: number|null}|null} Viewport dimensions.
 */
export function getComparisonViewport(comparison = {}) {
  let viewport = comparison.screenshot?.viewport || {};
  let width = viewport.width ?? null;
  let height = viewport.height ?? null;

  return width != null || height != null ? { width, height } : null;
}

/**
 * Read the browser from the current screenshot.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {string|null} The browser name when present.
 */
export function getComparisonBrowser(comparison = {}) {
  return comparison.screenshot?.browser || null;
}

/**
 * Read bitmap dimensions from a screenshot record.
 *
 * @param {Object} record - Screenshot record from the API.
 * @returns {{width: number|null, height: number|null}|null} Bitmap dimensions.
 */
function getBitmap(record = {}) {
  let bitmap = record.bitmap || {};
  let width = bitmap.width ?? null;
  let height = bitmap.height ?? null;

  return width != null || height != null ? { width, height } : null;
}

/**
 * Read viewport dimensions from a screenshot record.
 *
 * @param {Object} record - Screenshot record from the API.
 * @returns {{width: number|null, height: number|null}|null} Viewport dimensions.
 */
function getRecordViewport(record = {}) {
  let viewport = record.viewport || {};
  let width = viewport.width ?? null;
  let height = viewport.height ?? null;

  return width != null || height != null ? { width, height } : null;
}

/**
 * Normalize current screenshot identity, render facts, metadata, and asset URL.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {Object} Current screenshot details.
 */
function getCurrentScreenshot(comparison = {}) {
  let screenshot = comparison.screenshot || {};

  return {
    id: screenshot.id || null,
    name: screenshot.name || null,
    status: screenshot.status || null,
    browser: screenshot.browser || null,
    device: screenshot.device || null,
    viewport: getRecordViewport(screenshot),
    bitmap: getBitmap(screenshot),
    metadata: screenshot.metadata || null,
    signature: screenshot.signature || null,
    url: screenshot.url || null,
    error_message: screenshot.error_message || null,
  };
}

/**
 * Normalize the baseline screenshot without inventing missing render facts.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @returns {Object} Baseline screenshot details.
 */
function getBaselineScreenshot(comparison = {}) {
  let baseline = comparison.screenshot?.baseline || {};

  return {
    id: baseline.id || null,
    build_id: baseline.build_id || null,
    name: baseline.name || null,
    browser: baseline.browser || null,
    viewport: getRecordViewport(baseline),
    bitmap: getBitmap(baseline),
    metadata: baseline.metadata || null,
    signature: baseline.signature || null,
    url: baseline.url || null,
  };
}

/**
 * Keep the useful Honeydiff facts without including raw geometry by default.
 *
 * Agents need counts, fingerprints, URLs, analysis details, and the server's
 * artifact list for first-pass diagnosis. Raw regions and scoring details stay behind an explicit include
 * because they can dominate an otherwise bounded handoff.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @param {boolean} includeDiffs - Whether to include raw Honeydiff diagnostics.
 * @returns {Object} Compact diff evidence suitable for context summaries.
 */
function getComparisonDiff(comparison = {}, includeDiffs = false) {
  let diff = comparison.diff || {};
  let regions = diff.regions;
  let details = diff.details || null;
  let artifacts = diff.artifacts ?? null;

  let compact = {
    percentage: diff.percentage ?? null,
    changed_pixels: diff.changed_pixels ?? null,
    total_pixels: diff.total_pixels ?? null,
    threshold: diff.threshold ?? null,
    fingerprint_hash: diff.fingerprint_hash || null,
    region_count:
      diff.region_count ??
      details?.clusters?.count ??
      (Array.isArray(regions) ? regions.length : null),
    details,
    image_url: diff.image_url || null,
  };

  // Preserve server-owned evidence exactly so agents can verify and download
  // artifacts without the CLI recreating identities, digests, or availability.
  if (artifacts != null) {
    compact.artifacts = artifacts;
  }

  if (includeDiffs) {
    compact.regions = regions || [];
    compact.cluster_metadata = diff.cluster_metadata || null;
    compact.ssim_score = diff.ssim_score ?? null;
    compact.gmsd_score = diff.gmsd_score ?? null;
    compact.diff_lines = diff.diff_lines || [];
  }

  return compact;
}

/**
 * Prefer explicit review need and return null when the API supplied no review fact.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @param {string|null} reviewState - Review state for the record.
 * @returns {boolean|null} Whether the comparison needs review, when known.
 */
function comparisonNeedsReview(comparison = {}, reviewState = null) {
  if (comparison.needs_review != null) {
    return comparison.needs_review === true;
  }

  if (reviewState == null) {
    return null;
  }

  return reviewState === 'pending';
}

/**
 * Normalize one comparison from the current build-context API.
 *
 * @param {Object} comparison - Comparison record from the API.
 * @param {Object} options - Normalization options.
 * @param {boolean} [options.includeDiffs] - Include raw Honeydiff diagnostics.
 * @returns {Object} A stable comparison evidence record.
 */
export function normalizeComparisonRecord(comparison = {}, options = {}) {
  let reviewState = getVisualReviewState(comparison);

  return {
    id: comparison.id || null,
    name: getComparisonName(comparison),
    result: getComparisonResult(comparison),
    status: comparison.status || null,
    review_state: reviewState,
    visual_review: comparison.visual_review || null,
    build_branch: comparison.build_branch || null,
    needs_review: comparisonNeedsReview(comparison, reviewState),
    browser: getComparisonBrowser(comparison),
    viewport: getComparisonViewport(comparison),
    screenshot: getCurrentScreenshot(comparison),
    baseline: getBaselineScreenshot(comparison),
    diff: getComparisonDiff(comparison, options.includeDiffs === true),
  };
}

/**
 * Read the server's total variant count.
 *
 * @param {Object} group - Screenshot group from the API.
 * @returns {number|null} The explicit total when present.
 */
function getExplicitVariantCount(group = {}) {
  return group.total_variants ?? null;
}

/**
 * Prove whether every variant is available before deriving aggregate facts.
 *
 * @param {Object} group - Screenshot group from the API.
 * @param {Object[]} variants - Returned normalized variants.
 * @returns {boolean} Whether aggregate derivation is safe.
 */
function hasCompleteVariants(group = {}, variants = []) {
  let explicitCount = getExplicitVariantCount(group);
  return explicitCount != null && explicitCount === variants.length;
}

/**
 * Derive only facts backed by a complete variant set and complete source fields.
 *
 * Unknown review, result, or diff values stay null instead of becoming
 * client-authored false or zero values.
 *
 * @param {Object[]} variants - Complete normalized variants for one screenshot.
 * @param {boolean} complete - Whether every variant is present.
 * @returns {Object} Exact derived aggregate facts, or an empty object.
 */
function deriveAggregateFacts(variants = [], complete = false) {
  if (!complete) {
    return {};
  }

  let results = variants.map(variant => variant.result);
  let reviewStates = variants.map(variant => variant.review_state);
  let needsReview = variants.map(variant => variant.needs_review);
  let percentages = variants
    .map(variant => variant.diff.percentage)
    .filter(value => value != null);
  let allResultsKnown = results.every(value => value != null);
  let allReviewStatesKnown = reviewStates.every(value => value != null);
  let allNeedsReviewKnown = needsReview.every(value => value != null);

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
    max_diff_percentage:
      percentages.length === variants.length && percentages.length > 0
        ? Math.max(...percentages)
        : null,
  };
}

/**
 * Normalize a screenshot group while keeping explicit server totals unchanged.
 *
 * @param {Object} group - Grouped visual-review record from the API.
 * @param {Object} options - Normalization options.
 * @returns {Object} A normalized screenshot group and its variants.
 */
export function normalizeComparisonGroup(group = {}, options = {}) {
  let rawVariants = group.comparisons || [];
  let groupName = group.name || null;
  let variants = rawVariants.map(variant =>
    normalizeComparisonRecord(variant, {
      includeDiffs: options.includeDiffs,
    })
  );
  let complete = hasCompleteVariants(group, variants);
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
      max_diff_percentage:
        aggregate.max_diff_percentage ?? derived.max_diff_percentage ?? null,
    },
  };
}

/**
 * Join compact group variants to the exact comparison records in the same API
 * response.
 *
 * The build context API deliberately keeps group variants small while also
 * returning complete comparison evidence at the top level. Joining by the
 * server-owned comparison ID keeps the useful group ordering and aggregates
 * without dropping screenshot identity, baseline facts, or Honeydiff data.
 *
 * @param {Object[]} groups - Raw comparison groups from build context.
 * @param {Object[]} comparisons - Exact top-level comparison records.
 * @returns {Object[]} Groups whose variants include exact comparison evidence.
 */
function joinGroupComparisons(groups = [], comparisons = []) {
  let comparisonsById = new Map(
    comparisons
      .filter(comparison => comparison?.id)
      .map(comparison => [comparison.id, comparison])
  );

  return groups.map(group => {
    let comparisons = Array.isArray(group.comparisons) ? group.comparisons : [];

    return {
      ...group,
      comparisons: comparisons.map(variant => ({
        ...variant,
        ...(comparisonsById.get(variant.id) || {}),
      })),
    };
  });
}

/**
 * Keep failed capture identity, render evidence, and the API error together.
 *
 * A capture can fail before any comparison exists, so it must remain useful
 * evidence without inheriting comparison-only assumptions.
 *
 * @param {Object} screenshot - Failed screenshot record from the API.
 * @param {Object} options - Normalization options passed to the record.
 * @returns {Object} A normalized failed-capture record.
 */
function normalizeFailedCapture(screenshot = {}, options = {}) {
  let normalized = normalizeComparisonRecord(
    {
      screenshot,
      result: 'failed',
      status: screenshot.status || null,
      visual_review: screenshot.comparison?.visual_review || null,
    },
    options
  );

  return {
    ...normalized,
    error_message:
      screenshot.error_message || normalized.screenshot.error_message || null,
  };
}

/**
 * Collect failed captures from the build context response.
 *
 * @param {Object} context - Raw build context response.
 * @param {Object} options - Normalization options passed to each capture.
 * @returns {Object[]} Deduplicated failed captures in API order.
 */
function getFailedCaptures(context = {}, options = {}) {
  let explicit = Array.isArray(context.failed_captures)
    ? context.failed_captures
    : [];
  let screenshots = (context.screenshots || []).filter(screenshot =>
    ['failed', 'error'].includes(screenshot.status)
  );
  let captures = [...explicit, ...screenshots];
  let seen = new Set();

  return captures
    .map(capture => normalizeFailedCapture(capture, options))
    .filter(capture => {
      let key = capture.id || capture.screenshot.signature || capture.name;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

/**
 * Adapt raw build context for human presentation.
 *
 * Raw JSON output intentionally bypasses this lossy presentation boundary.
 *
 * @param {Object} context - Raw build context response from the provider.
 * @param {Object} options - Normalization options.
 * @param {boolean} [options.includeDiffs] - Include raw Honeydiff diagnostics.
 * @returns {Object} Normalized comparisons, groups, and failed captures.
 */
export function normalizeBuildContext(context = {}, options = {}) {
  let rawComparisons = context.comparisons || [];
  let comparisons = rawComparisons.map(comparison =>
    normalizeComparisonRecord(comparison, options)
  );
  let joinedGroups = joinGroupComparisons(context.groups || [], rawComparisons);
  let groups = joinedGroups.map(group =>
    normalizeComparisonGroup(group, options)
  );

  return {
    ...context,
    comparisons,
    groups,
    failed_captures: getFailedCaptures(context, options),
  };
}
