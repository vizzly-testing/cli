import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  normalizeComparisonUpdate,
  normalizeReportData,
} from '../../../src/reporter/src/utils/report-data.js';

describe('reporter/utils/report-data', () => {
  describe('normalizeReportData', () => {
    it('returns input when report data is nullish', () => {
      assert.strictEqual(normalizeReportData(null), null);
      assert.strictEqual(normalizeReportData(undefined), undefined);
    });

    it('returns input when comparisons is not an array', () => {
      let data = { timestamp: 123 };
      assert.strictEqual(normalizeReportData(data), data);
    });

    it('adds missing comparison timestamps from report timestamp', () => {
      let data = {
        timestamp: 123,
        comparisons: [{ id: 'a' }, { id: 'b', timestamp: 456 }],
      };

      let result = normalizeReportData(data);

      assert.strictEqual(result.comparisons[0].timestamp, 123);
      assert.strictEqual(result.comparisons[1].timestamp, 456);
    });

    it('preserves existing comparison timestamps', () => {
      let data = {
        timestamp: 123,
        comparisons: [
          { id: 'a', timestamp: 111 },
          { id: 'b', timestamp: 222 },
        ],
      };

      let result = normalizeReportData(data);

      assert.deepStrictEqual(result.comparisons, data.comparisons);
    });
  });

  describe('normalizeComparisonUpdate', () => {
    it('returns input when comparison already has timestamp', () => {
      let comparison = { id: 'a', timestamp: 111 };
      assert.strictEqual(normalizeComparisonUpdate(comparison, 999), comparison);
    });

    it('adds fallback timestamp when missing', () => {
      let comparison = { id: 'a' };
      let result = normalizeComparisonUpdate(comparison, 999);

      assert.strictEqual(result.timestamp, 999);
    });
  });
});
