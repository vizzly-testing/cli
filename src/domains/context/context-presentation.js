import { normalizeBuildContext } from './context.normalizers.js';

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

export function displayCompactBuildContext(output, context) {
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

export function displayCompactComparisonContext(output, context) {
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

export function displayBuildContext(output, context) {
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

export function displayComparisonContext(output, context) {
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

export function displayScreenshotContext(output, context) {
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

export function displayFingerprintContext(output, context) {
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

export function displayReviewQueueContext(output, context) {
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
