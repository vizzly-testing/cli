import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  calculateHotspotCoverage,
  shouldFilterAsHotspot,
} from '../../../src/tdd/core/hotspot-coverage.js';

describe('tdd/core/hotspot-coverage', () => {
  describe('calculateHotspotCoverage', () => {
    it('returns zero coverage for null diffClusters', () => {
      let result = calculateHotspotCoverage(null, {
        regions: [{ y1: 0, y2: 100 }],
      });

      assert.deepStrictEqual(result, {
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage for empty diffClusters', () => {
      let result = calculateHotspotCoverage([], {
        regions: [{ y1: 0, y2: 100 }],
      });

      assert.deepStrictEqual(result, {
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage for null hotspotAnalysis', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 50, height: 10 } }],
        null
      );

      assert.deepStrictEqual(result, {
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage for missing regions', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 50, height: 10 } }],
        {}
      );

      assert.deepStrictEqual(result, {
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage for empty regions', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 50, height: 10 } }],
        { regions: [] }
      );

      assert.deepStrictEqual(result, {
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage for clusters without boundingBox', () => {
      let result = calculateHotspotCoverage(
        [{ noBox: true }, { alsoNoBox: true }],
        { regions: [{ y1: 0, y2: 100 }] }
      );

      assert.deepStrictEqual(result, {
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('calculates 100% coverage when diff fully inside hotspot', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 50, height: 10 } }], // Lines 50-59
        { regions: [{ y1: 0, y2: 100 }] } // Covers 0-100
      );

      assert.strictEqual(result.coverage, 1);
      assert.strictEqual(result.linesInHotspots, 10);
      assert.strictEqual(result.totalLines, 10);
    });

    it('calculates 0% coverage when diff fully outside hotspot', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 200, height: 10 } }], // Lines 200-209
        { regions: [{ y1: 0, y2: 100 }] } // Covers 0-100
      );

      assert.strictEqual(result.coverage, 0);
      assert.strictEqual(result.linesInHotspots, 0);
      assert.strictEqual(result.totalLines, 10);
    });

    it('calculates partial coverage correctly', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 95, height: 10 } }], // Lines 95-104
        { regions: [{ y1: 0, y2: 100 }] } // Covers 0-100
      );

      // Lines 95-100 are inside (6 lines), 101-104 outside (4 lines)
      assert.strictEqual(result.linesInHotspots, 6);
      assert.strictEqual(result.totalLines, 10);
      assert.strictEqual(result.coverage, 0.6);
    });

    it('handles multiple clusters', () => {
      let result = calculateHotspotCoverage(
        [
          { boundingBox: { y: 50, height: 5 } }, // Lines 50-54, inside
          { boundingBox: { y: 200, height: 5 } }, // Lines 200-204, outside
        ],
        { regions: [{ y1: 0, y2: 100 }] }
      );

      assert.strictEqual(result.linesInHotspots, 5);
      assert.strictEqual(result.totalLines, 10);
      assert.strictEqual(result.coverage, 0.5);
    });

    it('handles multiple hotspot regions', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 150, height: 10 } }], // Lines 150-159
        {
          regions: [
            { y1: 0, y2: 100 }, // First hotspot
            { y1: 150, y2: 200 }, // Second hotspot - contains the diff
          ],
        }
      );

      assert.strictEqual(result.coverage, 1);
      assert.strictEqual(result.linesInHotspots, 10);
    });

    it('deduplicates overlapping lines from clusters', () => {
      let result = calculateHotspotCoverage(
        [
          { boundingBox: { y: 50, height: 10 } }, // Lines 50-59
          { boundingBox: { y: 55, height: 10 } }, // Lines 55-64, overlaps 55-59
        ],
        { regions: [{ y1: 0, y2: 100 }] }
      );

      // Unique lines: 50-64 = 15 lines total (not 20)
      assert.strictEqual(result.totalLines, 15);
      assert.strictEqual(result.linesInHotspots, 15);
      assert.strictEqual(result.coverage, 1);
    });

    it('handles cluster at exact boundary of hotspot', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 100, height: 1 } }], // Line 100 exactly
        { regions: [{ y1: 0, y2: 100 }] } // Includes line 100
      );

      assert.strictEqual(result.coverage, 1);
      assert.strictEqual(result.linesInHotspots, 1);
    });
  });

  describe('shouldFilterAsHotspot', () => {
    it('returns false for null hotspotAnalysis', () => {
      let result = shouldFilterAsHotspot(null, { coverage: 1 });

      assert.strictEqual(result, false);
    });

    it('returns false for null coverageResult', () => {
      let result = shouldFilterAsHotspot({ confidence: 'high' }, null);

      assert.strictEqual(result, false);
    });

    it('returns false when coverage is below 80%', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'high' },
        { coverage: 0.79 }
      );

      assert.strictEqual(result, false);
    });

    it('returns true when coverage >= 80% and confidence is high', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'high' },
        { coverage: 0.8 }
      );

      assert.strictEqual(result, true);
    });

    it('returns true when coverage >= 80% and confidenceScore > 0.7', () => {
      let result = shouldFilterAsHotspot(
        { confidenceScore: 0.75 },
        { coverage: 0.85 }
      );

      assert.strictEqual(result, true);
    });

    it('returns false when coverage >= 80% but confidence is not high', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'medium' },
        { coverage: 0.9 }
      );

      assert.strictEqual(result, false);
    });

    it('returns false when coverage >= 80% but confidenceScore <= 0.7', () => {
      let result = shouldFilterAsHotspot(
        { confidenceScore: 0.7 },
        { coverage: 0.9 }
      );

      assert.strictEqual(result, false);
    });

    it('returns false when coverage >= 80% but no confidence info', () => {
      let result = shouldFilterAsHotspot({}, { coverage: 0.9 });

      assert.strictEqual(result, false);
    });

    it('returns true at exactly 100% coverage with high confidence', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'high' },
        { coverage: 1.0 }
      );

      assert.strictEqual(result, true);
    });
  });
});
