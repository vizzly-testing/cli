export function getComparisonId(comparison) {
  return comparison?.id || comparison?.signature || comparison?.name;
}

export function stepReviewZoom(zoom, step) {
  if (typeof zoom !== 'number') return step > 0 ? 0.75 : 0.5;
  return Math.max(0.1, Math.min(3, zoom + step));
}

export function getReviewState(comparison) {
  if (comparison.userAction === 'accepted') return 'approved';
  if (comparison.userAction === 'rejected') return 'rejected';
  if (comparison.status === 'rejected') return 'rejected';
  if (comparison.status === 'passed') return 'approved';
  return 'pending';
}

export function getResult(comparison) {
  if (['new', 'baseline-created'].includes(comparison.status)) return 'new';
  if (comparison.status === 'passed') return 'unchanged';
  if (comparison.status === 'error') return 'error';
  return 'changed';
}

// Local captures may store viewports as an object or as flat dimensions.
export function getReviewMetadata(comparison) {
  let source = comparison.properties || {};
  let properties = {
    ...source.metadata,
    ...source.metadata?.properties,
    ...source,
  };
  let viewport = properties.viewport;
  let width =
    properties.viewport_width ?? viewport?.width ?? comparison.viewport_width;
  let height =
    properties.viewport_height ??
    viewport?.height ??
    comparison.viewport_height;
  let metadata = Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) =>
        !['browser', 'viewport', 'viewport_width', 'viewport_height'].includes(
          key
        )
    )
  );
  let viewportLabel = typeof viewport === 'string' ? viewport : undefined;
  if (width && height) viewportLabel = `${width}×${height}`;
  let normalized = {
    browser: properties.browser ?? comparison.browser,
    viewport: viewportLabel,
    ...metadata,
  };
  return Object.fromEntries(
    Object.entries(normalized).filter(
      ([, value]) =>
        value != null && typeof value !== 'object' && String(value) !== ''
    )
  );
}

export function groupReviewItems(comparisons) {
  let groups = new Map();
  for (let comparison of comparisons) {
    let name = comparison.originalName || comparison.name || 'Unknown';
    if (!groups.has(name)) groups.set(name, { name, variants: [] });
    groups.get(name).variants.push(comparison);
  }
  return [...groups.values()];
}

function matchesReviewFilter(comparison, filter) {
  let result = getResult(comparison);
  switch (filter) {
    case 'all':
      return true;
    case 'changes':
      return result === 'changed';
    case 'new':
      return result === 'new';
    case 'needs-review':
      return (
        ['changed', 'new'].includes(result) &&
        getReviewState(comparison) === 'pending'
      );
    default:
      return false;
  }
}

export function filterReviewItems(comparisons, filter, search) {
  let query = search.trim().toLowerCase();
  return comparisons.filter(comparison => {
    if (!matchesReviewFilter(comparison, filter)) return false;
    if (!query) return true;
    let searchText = [
      comparison.originalName,
      comparison.name,
      ...Object.values(getReviewMetadata(comparison)),
    ].join(' ');
    return searchText.toLowerCase().includes(query);
  });
}
