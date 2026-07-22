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
