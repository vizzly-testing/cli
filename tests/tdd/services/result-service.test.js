import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildResults,
  calculateSummary,
  findComparison,
  findComparisonById,
  getErrorComparisons,
  getFailedComparisons,
  getNewComparisons,
  isSuccessful,
} from '../../../src/tdd/services/result-service.js';

describe('tdd/services/result-service', () => {
  describe('calculateSummary', () => {
    it('calculates correct summary for mixed statuses', () => {
      let comparisons = [
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'new' },
        { status: 'error' },
      ];

      let summary = calculateSummary(comparisons);

      assert.deepStrictEqual(summary, {
        total: 5,
        passed: 2,
        failed: 1,
        new: 1,
        errors: 1,
      });
    });

    it('handles empty array', () => {
      let summary = calculateSummary([]);

      assert.deepStrictEqual(summary, {
        total: 0,
        passed: 0,
        failed: 0,
        new: 0,
        errors: 0,
      });
    });

    it('handles all passed', () => {
      let comparisons = [
        { status: 'passed' },
        { status: 'passed' },
        { status: 'passed' },
      ];

      let summary = calculateSummary(comparisons);

      assert.strictEqual(summary.total, 3);
      assert.strictEqual(summary.passed, 3);
      assert.strictEqual(summary.failed, 0);
    });

    it('handles all failed', () => {
      let comparisons = [{ status: 'failed' }, { status: 'failed' }];

      let summary = calculateSummary(comparisons);

      assert.strictEqual(summary.failed, 2);
      assert.strictEqual(summary.passed, 0);
    });

    it('ignores unknown statuses', () => {
      let comparisons = [{ status: 'passed' }, { status: 'unknown' }];

      let summary = calculateSummary(comparisons);

      assert.strictEqual(summary.total, 2);
      assert.strictEqual(summary.passed, 1);
      // Unknown status doesn't increment any counter
      assert.strictEqual(summary.failed, 0);
      assert.strictEqual(summary.new, 0);
      assert.strictEqual(summary.errors, 0);
    });
  });

  describe('buildResults', () => {
    it('builds results object with summary and comparisons', () => {
      let comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'failed' },
      ];
      let baselineData = { version: 1, screenshots: {} };

      let results = buildResults(comparisons, baselineData);

      assert.strictEqual(results.total, 2);
      assert.strictEqual(results.passed, 1);
      assert.strictEqual(results.failed, 1);
      assert.strictEqual(results.comparisons, comparisons);
      assert.strictEqual(results.baseline, baselineData);
    });

    it('includes new count in results', () => {
      let comparisons = [{ status: 'new' }, { status: 'new' }];

      let results = buildResults(comparisons, null);

      assert.strictEqual(results.new, 2);
    });
  });

  describe('getFailedComparisons', () => {
    it('returns only failed comparisons', () => {
      let comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'failed' },
        { id: '3', status: 'failed' },
        { id: '4', status: 'new' },
      ];

      let failed = getFailedComparisons(comparisons);

      assert.strictEqual(failed.length, 2);
      assert.ok(failed.every(c => c.status === 'failed'));
    });

    it('returns empty array when no failures', () => {
      let comparisons = [{ status: 'passed' }, { status: 'new' }];

      let failed = getFailedComparisons(comparisons);

      assert.strictEqual(failed.length, 0);
    });
  });

  describe('getNewComparisons', () => {
    it('returns only new comparisons', () => {
      let comparisons = [
        { id: '1', status: 'new' },
        { id: '2', status: 'passed' },
        { id: '3', status: 'new' },
      ];

      let newComps = getNewComparisons(comparisons);

      assert.strictEqual(newComps.length, 2);
      assert.ok(newComps.every(c => c.status === 'new'));
    });
  });

  describe('getErrorComparisons', () => {
    it('returns only error comparisons', () => {
      let comparisons = [
        { id: '1', status: 'error' },
        { id: '2', status: 'passed' },
        { id: '3', status: 'error' },
      ];

      let errors = getErrorComparisons(comparisons);

      assert.strictEqual(errors.length, 2);
      assert.ok(errors.every(c => c.status === 'error'));
    });
  });

  describe('isSuccessful', () => {
    it('returns true when all passed', () => {
      let comparisons = [{ status: 'passed' }, { status: 'passed' }];

      assert.strictEqual(isSuccessful(comparisons), true);
    });

    it('returns true when passed and new', () => {
      let comparisons = [{ status: 'passed' }, { status: 'new' }];

      assert.strictEqual(isSuccessful(comparisons), true);
    });

    it('returns false when any failed', () => {
      let comparisons = [{ status: 'passed' }, { status: 'failed' }];

      assert.strictEqual(isSuccessful(comparisons), false);
    });

    it('returns false when any error', () => {
      let comparisons = [{ status: 'passed' }, { status: 'error' }];

      assert.strictEqual(isSuccessful(comparisons), false);
    });

    it('returns true for empty array', () => {
      assert.strictEqual(isSuccessful([]), true);
    });
  });

  describe('findComparisonById', () => {
    it('finds comparison by ID', () => {
      let comparisons = [
        { id: 'abc123', name: 'homepage' },
        { id: 'def456', name: 'login' },
      ];

      let found = findComparisonById(comparisons, 'def456');

      assert.strictEqual(found.name, 'login');
    });

    it('returns null when not found', () => {
      let comparisons = [{ id: 'abc123', name: 'homepage' }];

      let found = findComparisonById(comparisons, 'notfound');

      assert.strictEqual(found, null);
    });

    it('returns null for empty array', () => {
      assert.strictEqual(findComparisonById([], 'any'), null);
    });
  });

  describe('findComparison', () => {
    it('finds comparison by name', () => {
      let comparisons = [
        { name: 'homepage', signature: 'sig1' },
        { name: 'login', signature: 'sig2' },
      ];

      let found = findComparison(comparisons, 'login');

      assert.strictEqual(found.signature, 'sig2');
    });

    it('finds comparison by signature when provided', () => {
      let comparisons = [
        { name: 'homepage', signature: 'homepage|1920|chrome' },
        { name: 'homepage', signature: 'homepage|1080|firefox' },
      ];

      let found = findComparison(
        comparisons,
        'homepage',
        'homepage|1080|firefox'
      );

      assert.strictEqual(found.signature, 'homepage|1080|firefox');
    });

    it('returns null when not found by name', () => {
      let comparisons = [{ name: 'homepage', signature: 'sig1' }];

      assert.strictEqual(findComparison(comparisons, 'notfound'), null);
    });

    it('returns null when not found by signature', () => {
      let comparisons = [{ name: 'homepage', signature: 'sig1' }];

      assert.strictEqual(findComparison(comparisons, 'homepage', 'sig2'), null);
    });
  });
});
