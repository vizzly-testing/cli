export function isNewComparisonStatus(status) {
  return status === 'new' || status === 'baseline-created';
}

export function needsReviewComparisonStatus(status) {
  return status === 'failed' || isNewComparisonStatus(status);
}
