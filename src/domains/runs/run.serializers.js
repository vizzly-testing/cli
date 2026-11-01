/**
 * Build API build payload from options
 * @param {Object} options - Run options
 * @param {Object} [comparisonConfig] - Comparison configuration (threshold, minClusterSize)
 * @returns {Object} Build payload for API
 */
export function buildApiBuildPayload(options, comparisonConfig = null) {
  let payload = {
    name: options.buildName || `Test Run ${new Date().toISOString()}`,
    branch: options.branch || 'main',
    environment: options.environment || 'test',
    commit_sha: options.commit,
    commit_message: options.message,
    commit_author_name: options.commitAuthorName,
    commit_author_email: options.commitAuthorEmail,
    github_pull_request_number: options.pullRequestNumber,
    parallel_id: options.parallelId,
  };

  // Only include metadata if we have meaningful config to send
  if (
    comparisonConfig?.threshold != null ||
    comparisonConfig?.minClusterSize != null
  ) {
    payload.metadata = {
      comparison: {
        threshold: comparisonConfig.threshold,
        minClusterSize: comparisonConfig.minClusterSize,
      },
    };
  }

  return payload;
}

/**
 * Build result object for disabled run (no Vizzly integration)
 * @returns {Object} Result object
 */
export function buildDisabledRunResult(reason = null) {
  return {
    testsPassed: 1,
    testsFailed: 0,
    screenshotsCaptured: 0,
    ...(reason
      ? {
          capture: {
            setup: 'disabled',
            reason,
            accepted: 0,
            rejected: 0,
            errors: 0,
          },
        }
      : {}),
  };
}

/**
 * Build final run result object
 * @param {Object} options - Options
 * @param {string|null} options.buildId - Build ID
 * @param {string|null} options.buildUrl - Build URL
 * @param {boolean} options.testSuccess - Whether tests passed
 * @param {number} options.screenshotCount - Number of screenshots
 * @param {Object|null} options.tddResults - TDD results (comparisons, etc.)
 * @param {Object|null} [options.uploadStats] - Cumulative cloud upload outcomes,
 * exposed as `uploads` independently of test and local comparison results.
 * @returns {Object} Final result object
 */
export function buildRunResult({
  buildId,
  buildUrl,
  testSuccess,
  screenshotCount,
  tddResults,
  uploadStats,
}) {
  return {
    buildId,
    url: buildUrl,
    testsPassed: testSuccess ? 1 : 0,
    testsFailed: testSuccess ? 0 : 1,
    screenshotsCaptured: screenshotCount,
    ...(uploadStats ? { uploads: uploadStats } : {}),
    comparisons: tddResults?.comparisons || null,
    failed: (tddResults?.failed || 0) > 0,
    ...(tddResults
      ? {
          summary: {
            total: tddResults.total ?? screenshotCount,
            passed: tddResults.passed || 0,
            failed: tddResults.failed || 0,
            new: tddResults.new || 0,
            errors: tddResults.errors || 0,
          },
          capture: {
            setup: 'ready',
            reason: tddResults.error || null,
            accepted: tddResults.capture?.accepted ?? screenshotCount,
            rejected: tddResults.capture?.rejected || 0,
            errors: tddResults.errors || 0,
          },
        }
      : {}),
  };
}
