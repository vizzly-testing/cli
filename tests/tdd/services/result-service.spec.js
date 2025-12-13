/**
 * Tests for result service
 *
 * Pure function tests - no mocking needed.
 */

import { describe, expect, it } from 'vitest';
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

describe('result-service', () => {
  describe('calculateSummary', () => {
    it('calculates counts for each status', () => {
      let comparisons = [
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'new' },
        { status: 'error' },
      ];

      let result = calculateSummary(comparisons);

      expect(result).toEqual({
        total: 5,
        passed: 2,
        failed: 1,
        new: 1,
        errors: 1,
      });
    });

    it('handles empty array', () => {
      let result = calculateSummary([]);

      expect(result).toEqual({
        total: 0,
        passed: 0,
        failed: 0,
        new: 0,
        errors: 0,
      });
    });

    it('handles all passed', () => {
      let comparisons = [{ status: 'passed' }, { status: 'passed' }];

      let result = calculateSummary(comparisons);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('handles unknown status gracefully', () => {
      let comparisons = [{ status: 'unknown' }, { status: 'passed' }];

      let result = calculateSummary(comparisons);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(1);
    });
  });

  describe('buildResults', () => {
    it('combines summary with comparisons and baseline', () => {
      let comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'failed' },
      ];
      let baselineData = { buildId: 'test-build' };

      let result = buildResults(comparisons, baselineData);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.comparisons).toBe(comparisons);
      expect(result.baseline).toBe(baselineData);
    });
  });

  describe('getFailedComparisons', () => {
    it('filters only failed comparisons', () => {
      let comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'failed', name: 'test1' },
        { id: '3', status: 'failed', name: 'test2' },
        { id: '4', status: 'new' },
      ];

      let result = getFailedComparisons(comparisons);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('test1');
      expect(result[1].name).toBe('test2');
    });

    it('returns empty array when no failures', () => {
      let comparisons = [{ status: 'passed' }, { status: 'new' }];

      expect(getFailedComparisons(comparisons)).toEqual([]);
    });
  });

  describe('getNewComparisons', () => {
    it('filters only new comparisons', () => {
      let comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'new', name: 'new1' },
        { id: '3', status: 'failed' },
      ];

      let result = getNewComparisons(comparisons);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('new1');
    });
  });

  describe('getErrorComparisons', () => {
    it('filters only error comparisons', () => {
      let comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'error', error: 'something broke' },
      ];

      let result = getErrorComparisons(comparisons);

      expect(result).toHaveLength(1);
      expect(result[0].error).toBe('something broke');
    });
  });

  describe('isSuccessful', () => {
    it('returns true when no failures or errors', () => {
      let comparisons = [
        { status: 'passed' },
        { status: 'new' },
        { status: 'passed' },
      ];

      expect(isSuccessful(comparisons)).toBe(true);
    });

    it('returns false when there are failures', () => {
      let comparisons = [{ status: 'passed' }, { status: 'failed' }];

      expect(isSuccessful(comparisons)).toBe(false);
    });

    it('returns false when there are errors', () => {
      let comparisons = [{ status: 'passed' }, { status: 'error' }];

      expect(isSuccessful(comparisons)).toBe(false);
    });

    it('returns true for empty array', () => {
      expect(isSuccessful([])).toBe(true);
    });
  });

  describe('findComparisonById', () => {
    it('finds comparison by id', () => {
      let comparisons = [
        { id: 'abc123', name: 'first' },
        { id: 'def456', name: 'second' },
      ];

      let result = findComparisonById(comparisons, 'def456');

      expect(result.name).toBe('second');
    });

    it('returns null when not found', () => {
      let comparisons = [{ id: 'abc123', name: 'first' }];

      expect(findComparisonById(comparisons, 'notfound')).toBeNull();
    });
  });

  describe('findComparison', () => {
    it('finds by name when signature not provided', () => {
      let comparisons = [
        { name: 'homepage', signature: 'homepage|1920|chrome' },
        { name: 'login', signature: 'login|1920|chrome' },
      ];

      let result = findComparison(comparisons, 'login');

      expect(result.signature).toBe('login|1920|chrome');
    });

    it('finds by signature when provided', () => {
      let comparisons = [
        { name: 'homepage', signature: 'homepage|1920|chrome' },
        { name: 'homepage', signature: 'homepage|1920|firefox' },
      ];

      let result = findComparison(
        comparisons,
        'homepage',
        'homepage|1920|firefox'
      );

      expect(result.signature).toBe('homepage|1920|firefox');
    });

    it('returns null when not found', () => {
      let comparisons = [
        { name: 'homepage', signature: 'homepage|1920|chrome' },
      ];

      expect(findComparison(comparisons, 'login')).toBeNull();
      expect(
        findComparison(comparisons, 'homepage', 'homepage|1920|safari')
      ).toBeNull();
    });
  });
});
