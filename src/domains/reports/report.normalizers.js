/**
 * Ensure each comparison has a timestamp for image cache-busting.
 */
export function normalizeReportData(reportData) {
  if (!reportData || !Array.isArray(reportData.comparisons)) {
    return reportData;
  }

  let needsNormalization = reportData.comparisons.some(
    comparison => comparison && comparison.timestamp == null
  );

  if (!needsNormalization) {
    return reportData;
  }

  let fallbackTimestamp = reportData.timestamp ?? Date.now();
  let comparisons = reportData.comparisons.map(comparison =>
    normalizeComparisonUpdate(comparison, fallbackTimestamp)
  );

  return {
    ...reportData,
    comparisons,
  };
}

/**
 * Ensure a single comparison includes a timestamp.
 */
export function normalizeComparisonUpdate(comparison, fallbackTimestamp) {
  if (!comparison || comparison.timestamp != null) {
    return comparison;
  }

  return {
    ...comparison,
    timestamp: fallbackTimestamp ?? Date.now(),
  };
}
