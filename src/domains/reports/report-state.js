/** Local review summaries intentionally count new baselines as passing captures. */
export function summarizeReportComparisons(comparisons = []) {
  let summary = {
    total: comparisons.length,
    passed: 0,
    failed: 0,
    rejected: 0,
    errors: 0,
  };
  for (let comparison of comparisons) {
    if (['passed', 'baseline-created', 'new'].includes(comparison.status)) {
      summary.passed++;
    } else if (comparison.status === 'failed') {
      summary.failed++;
    } else if (comparison.status === 'rejected') {
      summary.rejected++;
    } else if (comparison.status === 'error') {
      summary.errors++;
    }
  }
  return summary;
}

export function createEmptyReport(timestamp) {
  return { timestamp, comparisons: [], summary: summarizeReportComparisons() };
}

function withComparisons(report, comparisons, timestamp) {
  return {
    ...report,
    timestamp,
    comparisons,
    summary: summarizeReportComparisons(comparisons),
  };
}

export function upsertReportComparison(report, comparison, timestamp) {
  let previous = report.comparisons || [];
  let existing = previous.find(candidate => candidate.id === comparison.id);
  let updated = {
    ...comparison,
    initialStatus: existing?.initialStatus || comparison.status,
  };
  let comparisons = existing
    ? previous.map(candidate =>
        candidate.id === comparison.id ? updated : candidate
      )
    : [...previous, updated];
  return withComparisons(report, comparisons, timestamp);
}

export function removeReportComparison(report, id, timestamp) {
  let comparisons = (report.comparisons || []).filter(
    comparison => comparison.id !== id
  );
  return withComparisons(report, comparisons, timestamp);
}
