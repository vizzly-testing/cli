/**
 * Result Service
 *
 * Aggregates comparison results and provides summary statistics.
 */

/**
 * Calculate summary statistics from comparisons
 *
 * @param {Array} comparisons - Array of comparison results
 * @returns {{ total: number, passed: number, failed: number, new: number, errors: number }}
 */
export function calculateSummary(comparisons) {
  let passed = 0;
  let failed = 0;
  let newScreenshots = 0;
  let errors = 0;

  for (let c of comparisons) {
    switch (c.status) {
      case 'passed':
        passed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'new':
        newScreenshots++;
        break;
      case 'error':
        errors++;
        break;
    }
  }

  return {
    total: comparisons.length,
    passed,
    failed,
    new: newScreenshots,
    errors,
  };
}

/**
 * Build complete results object
 *
 * @param {Array} comparisons - Array of comparison results
 * @param {Object} baselineData - Baseline metadata
 * @returns {Object} Results object with summary and comparisons
 */
export function buildResults(comparisons, baselineData) {
  let summary = calculateSummary(comparisons);

  return {
    ...summary,
    comparisons,
    baseline: baselineData,
  };
}

/**
 * Get failed comparisons from results
 *
 * @param {Array} comparisons - Array of comparison results
 * @returns {Array} Failed comparisons
 */
export function getFailedComparisons(comparisons) {
  return comparisons.filter(c => c.status === 'failed');
}

/**
 * Get new comparisons from results
 *
 * @param {Array} comparisons - Array of comparison results
 * @returns {Array} New comparisons
 */
export function getNewComparisons(comparisons) {
  return comparisons.filter(c => c.status === 'new');
}

/**
 * Get error comparisons from results
 *
 * @param {Array} comparisons - Array of comparison results
 * @returns {Array} Error comparisons
 */
export function getErrorComparisons(comparisons) {
  return comparisons.filter(c => c.status === 'error');
}

/**
 * Check if results indicate overall success (no failures or errors)
 *
 * @param {Array} comparisons - Array of comparison results
 * @returns {boolean}
 */
export function isSuccessful(comparisons) {
  return !comparisons.some(c => c.status === 'failed' || c.status === 'error');
}

/**
 * Find comparison by ID
 *
 * @param {Array} comparisons - Array of comparison results
 * @param {string} id - Comparison ID
 * @returns {Object|null}
 */
export function findComparisonById(comparisons, id) {
  return comparisons.find(c => c.id === id) || null;
}

/**
 * Find comparison by name and signature
 *
 * @param {Array} comparisons - Array of comparison results
 * @param {string} name - Screenshot name
 * @param {string} signature - Screenshot signature (optional)
 * @returns {Object|null}
 */
export function findComparison(comparisons, name, signature = null) {
  if (signature) {
    return comparisons.find(c => c.signature === signature) || null;
  }
  return comparisons.find(c => c.name === name) || null;
}
