import { COMPARISON_STATUS } from './constants.js';

export function sortComparisons(comparisons, sortBy) {
  return [...comparisons].sort((a, b) => {
    if (sortBy === 'priority') {
      const priorityOrder = {
        [COMPARISON_STATUS.FAILED]: 3,
        [COMPARISON_STATUS.NEW]: 2,
        [COMPARISON_STATUS.PASSED]: 1,
      };
      // Use initialStatus for sorting to keep order stable after approval
      // Falls back to status for backward compatibility with existing data
      const aStatus = a.initialStatus || a.status;
      const bStatus = b.initialStatus || b.status;
      const aPriority = priorityOrder[aStatus] || 0;
      const bPriority = priorityOrder[bStatus] || 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return (b.diffPercentage || 0) - (a.diffPercentage || 0);
    }
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'time') {
      return (b.timestamp || 0) - (a.timestamp || 0);
    }
    return 0;
  });
}

export function filterComparisons(comparisons, filter) {
  if (filter === 'failed') {
    return comparisons.filter(c => c.status === COMPARISON_STATUS.FAILED);
  }
  if (filter === 'passed') {
    return comparisons.filter(c => c.status === COMPARISON_STATUS.PASSED);
  }
  if (filter === 'new') {
    return comparisons.filter(
      c =>
        c.status === COMPARISON_STATUS.NEW ||
        c.status === COMPARISON_STATUS.BASELINE_CREATED
    );
  }
  return comparisons;
}
