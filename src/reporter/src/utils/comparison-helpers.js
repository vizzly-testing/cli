import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { COMPARISON_STATUS } from './constants.js';

const STATUS_CONFIG = {
  [COMPARISON_STATUS.NEW]: {
    type: 'success',
    label: 'New Baseline Created',
    description: 'This is the first screenshot for this test',
    icon: CheckCircleIcon,
    colorClass: 'green',
  },
  [COMPARISON_STATUS.PASSED]: {
    type: 'success',
    label: 'Comparison Passed',
    description: 'Screenshot matches the baseline',
    icon: CheckCircleIcon,
    colorClass: 'green',
  },
  [COMPARISON_STATUS.FAILED]: {
    type: 'error',
    label: 'Visual Differences Detected',
    icon: XCircleIcon,
    colorClass: 'red',
  },
  [COMPARISON_STATUS.ERROR]: {
    type: 'warning',
    label: 'Comparison Error',
    description: 'An error occurred during comparison',
    icon: ExclamationTriangleIcon,
    colorClass: 'yellow',
  },
};

export function getStatusInfo(comparison) {
  let config = STATUS_CONFIG[comparison.status] || {
    type: 'warning',
    label: 'Unknown Status',
    description: 'Unable to determine comparison status',
    icon: ExclamationTriangleIcon,
    colorClass: 'yellow',
  };

  // Add diff percentage to failed comparisons
  if (comparison.status === COMPARISON_STATUS.FAILED) {
    const diffPercent = comparison.diffPercentage?.toFixed(2) || '0.00';
    config = {
      ...config,
      description: `${diffPercent}% difference from baseline`,
    };
  }

  return config;
}

export function calculatePassRate(summary) {
  if (!summary || summary.total === 0) return 0;
  return Math.round((summary.passed / summary.total) * 100);
}

export function sortComparisons(comparisons, sortBy) {
  return [...comparisons].sort((a, b) => {
    if (sortBy === 'priority') {
      const priorityOrder = {
        [COMPARISON_STATUS.FAILED]: 3,
        [COMPARISON_STATUS.NEW]: 2,
        [COMPARISON_STATUS.PASSED]: 1,
      };
      const aPriority = priorityOrder[a.status] || 0;
      const bPriority = priorityOrder[b.status] || 0;
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
    return comparisons.filter(c => c.status === COMPARISON_STATUS.NEW);
  }
  return comparisons;
}
