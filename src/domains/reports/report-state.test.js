import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createEmptyReport,
  removeReportComparison,
  summarizeReportComparisons,
  upsertReportComparison,
} from './report-state.js';

test('local report summaries distinguish review decisions from capture outcomes', () => {
  let comparisons = [
    'passed',
    'new',
    'baseline-created',
    'failed',
    'rejected',
    'error',
    'baseline-updated',
  ].map((status, id) => ({ id, status }));
  assert.deepEqual(summarizeReportComparisons(comparisons), {
    total: 7,
    passed: 3,
    failed: 1,
    rejected: 1,
    errors: 1,
  });
  assert.deepEqual(createEmptyReport(42), {
    timestamp: 42,
    comparisons: [],
    summary: { total: 0, passed: 0, failed: 0, rejected: 0, errors: 0 },
  });
});

test('comparison updates preserve the original review order and same-name variants', () => {
  let initial = createEmptyReport(1);
  let first = upsertReportComparison(
    initial,
    { id: 'firefox', name: 'Home', status: 'failed' },
    2
  );
  let variants = upsertReportComparison(
    first,
    { id: 'chrome', name: 'Home', status: 'new' },
    3
  );
  let approved = upsertReportComparison(
    variants,
    { id: 'firefox', name: 'Home', status: 'passed', diff: null },
    4
  );
  assert.equal(approved.comparisons.length, 2);
  assert.equal(approved.comparisons[0].initialStatus, 'failed');
  assert.equal(approved.comparisons[1].initialStatus, 'new');
  assert.deepEqual(approved.summary, {
    total: 2,
    passed: 2,
    failed: 0,
    rejected: 0,
    errors: 0,
  });
  assert.equal(variants.comparisons[0].status, 'failed');
  assert.equal(initial.comparisons.length, 0);
});

test('deletion recalculates the same summary contract including an empty report', () => {
  let report = {
    custom: 'kept',
    comparisons: [
      { id: 'one', status: 'rejected' },
      { id: 'two', status: 'error' },
    ],
  };
  let remaining = removeReportComparison(report, 'one', 10);
  assert.equal(remaining.custom, 'kept');
  assert.equal(remaining.timestamp, 10);
  assert.deepEqual(remaining.summary, {
    total: 1,
    passed: 0,
    failed: 0,
    rejected: 0,
    errors: 1,
  });
  assert.deepEqual(
    removeReportComparison(remaining, 'two', 11).summary,
    createEmptyReport(11).summary
  );
  assert.equal(report.comparisons.length, 2);
});
