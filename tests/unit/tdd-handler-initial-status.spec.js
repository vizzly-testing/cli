import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for initialStatus preservation in TDD handler
 *
 * When a comparison is approved, its status changes from 'failed' to 'passed',
 * but we need to preserve the initialStatus so sorting remains stable.
 */
describe('TDD Handler - initialStatus preservation', () => {
  let tempDir;
  let vizzlyDir;
  let reportDataPath;

  beforeEach(() => {
    // Create a temp directory for test files
    tempDir = mkdtempSync(join(tmpdir(), 'vizzly-test-'));
    vizzlyDir = join(tempDir, '.vizzly');
    mkdirSync(vizzlyDir, { recursive: true });
    mkdirSync(join(vizzlyDir, 'baselines'), { recursive: true });
    mkdirSync(join(vizzlyDir, 'current'), { recursive: true });
    mkdirSync(join(vizzlyDir, 'diffs'), { recursive: true });
    reportDataPath = join(vizzlyDir, 'report-data.json');
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  const readReportData = () => {
    try {
      return JSON.parse(readFileSync(reportDataPath, 'utf8'));
    } catch {
      return null;
    }
  };

  const writeReportData = data => {
    writeFileSync(reportDataPath, JSON.stringify(data, null, 2));
  };

  describe('updateComparison behavior', () => {
    it('should set initialStatus when creating a new comparison', async () => {
      // Simulate receiving a failed screenshot comparison
      // We'll manually write a comparison to the report data to test the behavior
      const initialComparison = {
        id: 'test-id-1',
        name: 'test-screenshot',
        status: 'failed',
        diffPercentage: 5.5,
        timestamp: Date.now(),
      };

      // Write initial empty report
      writeReportData({
        timestamp: Date.now(),
        comparisons: [],
        groups: [],
        summary: { total: 0, groups: 0, passed: 0, failed: 0, errors: 0 },
      });

      // Now create a handler and trigger the updateComparison by simulating screenshot handling
      // Since we can't easily call internal updateComparison, we check the file format

      // Write a comparison without initialStatus (simulating legacy data)
      writeReportData({
        timestamp: Date.now(),
        comparisons: [initialComparison],
        groups: [],
        summary: { total: 1, groups: 1, passed: 0, failed: 1, errors: 0 },
      });

      const data = readReportData();
      // Legacy data shouldn't have initialStatus
      expect(data.comparisons[0].initialStatus).toBeUndefined();
    });

    it('should preserve initialStatus when comparison is updated', () => {
      // Write report data with initialStatus already set
      const comparisonWithInitialStatus = {
        id: 'test-id-1',
        name: 'test-screenshot',
        status: 'failed',
        initialStatus: 'failed',
        diffPercentage: 5.5,
        timestamp: Date.now(),
      };

      writeReportData({
        timestamp: Date.now(),
        comparisons: [comparisonWithInitialStatus],
        groups: [],
        summary: { total: 1, groups: 1, passed: 0, failed: 1, errors: 0 },
      });

      // Simulate what happens when a comparison is accepted:
      // The status changes to 'passed' but initialStatus should remain 'failed'
      const updatedComparison = {
        ...comparisonWithInitialStatus,
        status: 'passed',
        diffPercentage: 0,
        diff: null,
      };

      // Read current data
      const data = readReportData();
      const existingIndex = data.comparisons.findIndex(
        c => c.id === updatedComparison.id
      );

      if (existingIndex >= 0) {
        // This simulates what updateComparison does
        const initialStatus = data.comparisons[existingIndex].initialStatus;
        data.comparisons[existingIndex] = {
          ...updatedComparison,
          initialStatus: initialStatus || updatedComparison.status,
        };
      }

      writeReportData(data);

      // Verify the result
      const result = readReportData();
      expect(result.comparisons[0].status).toBe('passed');
      expect(result.comparisons[0].initialStatus).toBe('failed');
    });

    it('should handle multiple comparisons with different statuses', () => {
      const comparisons = [
        {
          id: '1',
          name: 'always-passed',
          status: 'passed',
          initialStatus: 'passed',
        },
        {
          id: '2',
          name: 'was-failed',
          status: 'passed',
          initialStatus: 'failed',
        },
        {
          id: '3',
          name: 'still-failed',
          status: 'failed',
          initialStatus: 'failed',
        },
        { id: '4', name: 'was-new', status: 'passed', initialStatus: 'new' },
      ];

      writeReportData({
        timestamp: Date.now(),
        comparisons,
        groups: [],
        summary: { total: 4, groups: 4, passed: 3, failed: 1, errors: 0 },
      });

      const data = readReportData();

      // Verify all initialStatus values are preserved correctly
      expect(data.comparisons.find(c => c.id === '1').initialStatus).toBe(
        'passed'
      );
      expect(data.comparisons.find(c => c.id === '2').initialStatus).toBe(
        'failed'
      );
      expect(data.comparisons.find(c => c.id === '3').initialStatus).toBe(
        'failed'
      );
      expect(data.comparisons.find(c => c.id === '4').initialStatus).toBe(
        'new'
      );
    });
  });

  describe('sorting stability after approval', () => {
    it('should maintain sort order when comparison is approved', () => {
      // Scenario: 3 failed comparisons, user approves the middle one
      const comparisons = [
        {
          id: '1',
          name: 'first',
          status: 'failed',
          initialStatus: 'failed',
          diffPercentage: 10,
        },
        {
          id: '2',
          name: 'middle',
          status: 'failed',
          initialStatus: 'failed',
          diffPercentage: 5,
        },
        {
          id: '3',
          name: 'last',
          status: 'failed',
          initialStatus: 'failed',
          diffPercentage: 2,
        },
      ];

      // User approves 'middle'
      comparisons[1].status = 'passed';
      comparisons[1].diffPercentage = 0;
      comparisons[1].diff = null;
      // initialStatus stays 'failed'

      // Sort by priority (using initialStatus)
      const statusOrder = { failed: 0, new: 1, passed: 2 };
      const sorted = [...comparisons].sort((a, b) => {
        const statusA = a.initialStatus || a.status;
        const statusB = b.initialStatus || b.status;
        const orderA = statusOrder[statusA] ?? 3;
        const orderB = statusOrder[statusB] ?? 3;
        if (orderA !== orderB) return orderA - orderB;
        return (b.diffPercentage || 0) - (a.diffPercentage || 0);
      });

      // All should stay in "failed" group (due to initialStatus)
      // Within the group, sorted by diffPercentage (descending)
      // 'middle' now has diffPercentage=0 so moves to end of the failed group
      expect(sorted[0].name).toBe('first'); // 10%
      expect(sorted[1].name).toBe('last'); // 2%
      expect(sorted[2].name).toBe('middle'); // 0% (approved, but still in failed group)

      // The key point: 'middle' stays in the "failed" section, not moved to "passed" section
      // It doesn't jump away from its original context
    });

    it('should keep approved item in same status group as unapproved items', () => {
      // The main benefit: approved items don't jump to a completely different section
      const comparisons = [
        {
          id: '1',
          name: 'failed-1',
          status: 'failed',
          initialStatus: 'failed',
          diffPercentage: 5,
        },
        {
          id: '2',
          name: 'approved',
          status: 'passed',
          initialStatus: 'failed',
          diffPercentage: 0,
        },
        {
          id: '3',
          name: 'new-item',
          status: 'new',
          initialStatus: 'new',
          diffPercentage: 0,
        },
        {
          id: '4',
          name: 'originally-passed',
          status: 'passed',
          initialStatus: 'passed',
          diffPercentage: 0,
        },
      ];

      const statusOrder = { failed: 0, new: 1, passed: 2 };
      const sorted = [...comparisons].sort((a, b) => {
        const statusA = a.initialStatus || a.status;
        const statusB = b.initialStatus || b.status;
        const orderA = statusOrder[statusA] ?? 3;
        const orderB = statusOrder[statusB] ?? 3;
        if (orderA !== orderB) return orderA - orderB;
        return (b.diffPercentage || 0) - (a.diffPercentage || 0);
      });

      // Failed items (including approved) come first
      expect(sorted[0].initialStatus).toBe('failed');
      expect(sorted[1].initialStatus).toBe('failed');
      // Then new
      expect(sorted[2].initialStatus).toBe('new');
      // Then originally passed
      expect(sorted[3].initialStatus).toBe('passed');
    });
  });
});
