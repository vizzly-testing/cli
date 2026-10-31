import { getVisualReviewState } from '../context/context.normalizers.js';

export function normalizeBuildStatus(buildStatus) {
  return buildStatus.build;
}

/**
 * Read the processing counts from the status response.
 *
 * @param {Object} status - Status response.
 * @returns {Object} API-provided processing facts.
 */
export function getProcessingStatus(status = {}) {
  return status.processing;
}

/**
 * Read comparison totals without deriving them from screenshot counts.
 *
 * @param {Object} status - Status response.
 * @returns {Object} API-provided comparison facts.
 */
export function getComparisonStatus(status = {}) {
  return status.comparisons;
}

/**
 * Read the build review state without mixing it with processing status.
 *
 * @param {Object} status - Status response.
 * @returns {string|null} API-provided review state when available.
 */
export function getBuildReviewState(status = {}) {
  let build = normalizeBuildStatus(status);
  return getVisualReviewState(build);
}
