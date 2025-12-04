import { describe, expect, it } from 'vitest';
import {
  calculatePassRate,
  filterComparisons,
  getStatusInfo,
  sortComparisons,
} from '../../src/reporter/src/utils/comparison-helpers.js';

describe('comparison-helpers', () => {
  describe('sortComparisons', () => {
    let comparisons;

    beforeEach(() => {
      comparisons = [
        { id: '1', name: 'passed-test', status: 'passed', diffPercentage: 0 },
        { id: '2', name: 'failed-test', status: 'failed', diffPercentage: 5.5 },
        { id: '3', name: 'new-test', status: 'new', diffPercentage: 0 },
        {
          id: '4',
          name: 'another-failed',
          status: 'failed',
          diffPercentage: 2.3,
        },
      ];
    });

    describe('priority sorting', () => {
      it('should sort by status priority: failed > new > passed', () => {
        const sorted = sortComparisons(comparisons, 'priority');

        expect(sorted[0].status).toBe('failed');
        expect(sorted[1].status).toBe('failed');
        expect(sorted[2].status).toBe('new');
        expect(sorted[3].status).toBe('passed');
      });

      it('should sort failed comparisons by diffPercentage descending', () => {
        const sorted = sortComparisons(comparisons, 'priority');

        // Both failed ones should be first, sorted by diffPercentage
        expect(sorted[0].name).toBe('failed-test'); // 5.5%
        expect(sorted[1].name).toBe('another-failed'); // 2.3%
      });

      it('should use initialStatus for sorting when available', () => {
        // Simulate a comparison that was approved (status changed from failed to passed)
        const comparisonsWithInitialStatus = [
          {
            id: '1',
            name: 'was-passed',
            status: 'passed',
            initialStatus: 'passed',
            diffPercentage: 0,
          },
          {
            id: '2',
            name: 'was-failed-now-passed',
            status: 'passed',
            initialStatus: 'failed',
            diffPercentage: 0,
          },
          {
            id: '3',
            name: 'still-failed',
            status: 'failed',
            initialStatus: 'failed',
            diffPercentage: 5,
          },
          {
            id: '4',
            name: 'was-new',
            status: 'passed',
            initialStatus: 'new',
            diffPercentage: 0,
          },
        ];

        const sorted = sortComparisons(
          comparisonsWithInitialStatus,
          'priority'
        );

        // Should sort by initialStatus, not current status
        // Within same initialStatus group, sort by diffPercentage (descending)
        // Order: failed with diff (3), failed approved (2), new (4), passed (1)
        expect(sorted[0].name).toBe('still-failed'); // failed, 5% diff
        expect(sorted[1].name).toBe('was-failed-now-passed'); // failed, 0% diff (approved)
        expect(sorted[2].name).toBe('was-new'); // new
        expect(sorted[3].name).toBe('was-passed'); // passed
      });

      it('should fall back to status when initialStatus is not available', () => {
        // Legacy data without initialStatus
        const legacyComparisons = [
          { id: '1', name: 'passed', status: 'passed' },
          { id: '2', name: 'failed', status: 'failed' },
        ];

        const sorted = sortComparisons(legacyComparisons, 'priority');

        expect(sorted[0].name).toBe('failed');
        expect(sorted[1].name).toBe('passed');
      });

      it('should keep approved comparisons in original position among failed ones', () => {
        // This simulates the real-world scenario:
        // User has 3 failed screenshots, approves the middle one
        const comparisonsAfterApproval = [
          {
            id: '1',
            name: 'first-failed',
            status: 'failed',
            initialStatus: 'failed',
            diffPercentage: 10,
          },
          {
            id: '2',
            name: 'approved-one',
            status: 'passed',
            initialStatus: 'failed',
            diffPercentage: 5,
          },
          {
            id: '3',
            name: 'third-failed',
            status: 'failed',
            initialStatus: 'failed',
            diffPercentage: 3,
          },
        ];

        const sorted = sortComparisons(comparisonsAfterApproval, 'priority');

        // All should stay in "failed" section, sorted by diffPercentage
        expect(sorted[0].name).toBe('first-failed'); // 10%
        expect(sorted[1].name).toBe('approved-one'); // 5%
        expect(sorted[2].name).toBe('third-failed'); // 3%
      });
    });

    describe('name sorting', () => {
      it('should sort alphabetically by name', () => {
        const sorted = sortComparisons(comparisons, 'name');

        expect(sorted[0].name).toBe('another-failed');
        expect(sorted[1].name).toBe('failed-test');
        expect(sorted[2].name).toBe('new-test');
        expect(sorted[3].name).toBe('passed-test');
      });
    });

    describe('time sorting', () => {
      it('should sort by timestamp descending (newest first)', () => {
        const timedComparisons = [
          { id: '1', name: 'old', timestamp: 1000 },
          { id: '2', name: 'newest', timestamp: 3000 },
          { id: '3', name: 'middle', timestamp: 2000 },
        ];

        const sorted = sortComparisons(timedComparisons, 'time');

        expect(sorted[0].name).toBe('newest');
        expect(sorted[1].name).toBe('middle');
        expect(sorted[2].name).toBe('old');
      });
    });

    it('should not mutate the original array', () => {
      const original = [...comparisons];
      sortComparisons(comparisons, 'priority');

      expect(comparisons).toEqual(original);
    });
  });

  describe('filterComparisons', () => {
    let comparisons;

    beforeEach(() => {
      comparisons = [
        { id: '1', status: 'passed' },
        { id: '2', status: 'failed' },
        { id: '3', status: 'new' },
        { id: '4', status: 'baseline-created' },
        { id: '5', status: 'passed' },
      ];
    });

    it('should return all comparisons for "all" filter', () => {
      const filtered = filterComparisons(comparisons, 'all');
      expect(filtered).toHaveLength(5);
    });

    it('should filter only failed comparisons', () => {
      const filtered = filterComparisons(comparisons, 'failed');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('failed');
    });

    it('should filter only passed comparisons', () => {
      const filtered = filterComparisons(comparisons, 'passed');
      expect(filtered).toHaveLength(2);
      for (let c of filtered) {
        expect(c.status).toBe('passed');
      }
    });

    it('should filter new and baseline-created as "new"', () => {
      const filtered = filterComparisons(comparisons, 'new');
      expect(filtered).toHaveLength(2);
      for (let c of filtered) {
        expect(['new', 'baseline-created']).toContain(c.status);
      }
    });
  });

  describe('getStatusInfo', () => {
    it('should return correct info for passed status', () => {
      const info = getStatusInfo({ status: 'passed' });
      expect(info.type).toBe('success');
      expect(info.label).toBe('Passed');
    });

    it('should return correct info for failed status with diff percentage', () => {
      const info = getStatusInfo({ status: 'failed', diffPercentage: 2.567 });
      expect(info.type).toBe('error');
      expect(info.label).toBe('Visual Differences Detected');
      expect(info.description).toBe('2.57% difference from baseline');
    });

    it('should return correct info for new status', () => {
      const info = getStatusInfo({ status: 'new' });
      expect(info.type).toBe('success');
      expect(info.label).toBe('New Baseline');
    });

    it('should handle unknown status gracefully', () => {
      const info = getStatusInfo({ status: 'unknown-status' });
      expect(info.type).toBe('warning');
      expect(info.label).toBe('Unknown Status');
    });
  });

  describe('calculatePassRate', () => {
    it('should calculate correct pass rate', () => {
      const rate = calculatePassRate({ total: 10, passed: 7 });
      expect(rate).toBe(70);
    });

    it('should return 0 for empty summary', () => {
      expect(calculatePassRate(null)).toBe(0);
      expect(calculatePassRate({ total: 0, passed: 0 })).toBe(0);
    });

    it('should round to nearest integer', () => {
      const rate = calculatePassRate({ total: 3, passed: 1 });
      expect(rate).toBe(33); // 33.33... rounded
    });
  });
});
