import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  calculateRegionCoverage,
  clusterIntersectsRegion,
  shouldAutoApproveFromRegions,
} from '../../../src/tdd/core/region-coverage.js';

describe('tdd/core/region-coverage', () => {
  describe('clusterIntersectsRegion', () => {
    it('returns false for null cluster', () => {
      let result = clusterIntersectsRegion(null, {
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
      });
      assert.strictEqual(result, false);
    });

    it('returns false for cluster without boundingBox', () => {
      let result = clusterIntersectsRegion(
        {},
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, false);
    });

    it('returns false for null region', () => {
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 10, y: 10, width: 20, height: 20 } },
        null
      );
      assert.strictEqual(result, false);
    });

    it('detects cluster fully inside region', () => {
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 20, y: 20, width: 10, height: 10 } },
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, true);
    });

    it('detects cluster overlapping region edge', () => {
      // Cluster from x=90-110, region ends at x=100
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 90, y: 50, width: 20, height: 10 } },
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, true);
    });

    it('returns false when cluster is completely left of region', () => {
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 0, y: 50, width: 10, height: 10 } },
        { x1: 50, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, false);
    });

    it('returns false when cluster is completely right of region', () => {
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 150, y: 50, width: 10, height: 10 } },
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, false);
    });

    it('returns false when cluster is completely above region', () => {
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 50, y: 0, width: 10, height: 10 } },
        { x1: 0, y1: 50, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, false);
    });

    it('returns false when cluster is completely below region', () => {
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 50, y: 150, width: 10, height: 10 } },
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, false);
    });

    it('detects corner overlap', () => {
      // Cluster overlaps bottom-right corner of region
      let result = clusterIntersectsRegion(
        { boundingBox: { x: 95, y: 95, width: 20, height: 20 } },
        { x1: 0, y1: 0, x2: 100, y2: 100 }
      );
      assert.strictEqual(result, true);
    });
  });

  describe('calculateRegionCoverage', () => {
    it('returns zero coverage for null diffClusters', () => {
      let result = calculateRegionCoverage(null, [
        { x1: 0, y1: 0, x2: 100, y2: 100 },
      ]);

      assert.deepStrictEqual(result, {
        coverage: 0,
        clustersInRegions: 0,
        totalClusters: 0,
        matchedRegions: [],
      });
    });

    it('returns zero coverage for empty diffClusters', () => {
      let result = calculateRegionCoverage(
        [],
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.deepStrictEqual(result, {
        coverage: 0,
        clustersInRegions: 0,
        totalClusters: 0,
        matchedRegions: [],
      });
    });

    it('returns zero coverage for null regions', () => {
      let result = calculateRegionCoverage(
        [{ boundingBox: { x: 50, y: 50, width: 10, height: 10 } }],
        null
      );

      assert.strictEqual(result.coverage, 0);
      assert.strictEqual(result.totalClusters, 1);
    });

    it('returns zero coverage for empty regions', () => {
      let result = calculateRegionCoverage(
        [{ boundingBox: { x: 50, y: 50, width: 10, height: 10 } }],
        []
      );

      assert.strictEqual(result.coverage, 0);
      assert.strictEqual(result.totalClusters, 1);
    });

    it('calculates 100% coverage when all clusters in region', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 10, y: 10, width: 5, height: 5 } },
          { boundingBox: { x: 20, y: 20, width: 5, height: 5 } },
        ],
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.strictEqual(result.coverage, 1);
      assert.strictEqual(result.clustersInRegions, 2);
      assert.strictEqual(result.totalClusters, 2);
    });

    it('calculates 0% coverage when no clusters in region', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 200, y: 200, width: 5, height: 5 } },
          { boundingBox: { x: 300, y: 300, width: 5, height: 5 } },
        ],
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.strictEqual(result.coverage, 0);
      assert.strictEqual(result.clustersInRegions, 0);
      assert.strictEqual(result.totalClusters, 2);
    });

    it('calculates 50% coverage when half clusters in region', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 10, y: 10, width: 5, height: 5 } }, // Inside
          { boundingBox: { x: 200, y: 200, width: 5, height: 5 } }, // Outside
        ],
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.strictEqual(result.coverage, 0.5);
      assert.strictEqual(result.clustersInRegions, 1);
      assert.strictEqual(result.totalClusters, 2);
    });

    it('handles multiple regions', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 10, y: 10, width: 5, height: 5 } }, // In region 1
          { boundingBox: { x: 210, y: 210, width: 5, height: 5 } }, // In region 2
        ],
        [
          { id: 'region-1', x1: 0, y1: 0, x2: 100, y2: 100 },
          { id: 'region-2', x1: 200, y1: 200, x2: 300, y2: 300 },
        ]
      );

      assert.strictEqual(result.coverage, 1);
      assert.strictEqual(result.clustersInRegions, 2);
      assert.deepStrictEqual(result.matchedRegions.sort(), [
        'region-1',
        'region-2',
      ]);
    });

    it('tracks matched region ids', () => {
      let result = calculateRegionCoverage(
        [{ boundingBox: { x: 10, y: 10, width: 5, height: 5 } }],
        [{ id: 'timestamp-region', x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.deepStrictEqual(result.matchedRegions, ['timestamp-region']);
    });

    it('tracks matched region labels when no id', () => {
      let result = calculateRegionCoverage(
        [{ boundingBox: { x: 10, y: 10, width: 5, height: 5 } }],
        [{ label: 'avatar', x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.deepStrictEqual(result.matchedRegions, ['avatar']);
    });
  });

  describe('shouldAutoApproveFromRegions', () => {
    it('returns false for null regions', () => {
      let result = shouldAutoApproveFromRegions(null, { coverage: 1 });
      assert.strictEqual(result, false);
    });

    it('returns false for empty regions', () => {
      let result = shouldAutoApproveFromRegions([], { coverage: 1 });
      assert.strictEqual(result, false);
    });

    it('returns false for null coverageResult', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        null
      );
      assert.strictEqual(result, false);
    });

    it('returns false when coverage below 80%', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.79 }
      );
      assert.strictEqual(result, false);
    });

    it('returns true when coverage exactly 80%', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.8 }
      );
      assert.strictEqual(result, true);
    });

    it('returns true when coverage above 80%', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.95 }
      );
      assert.strictEqual(result, true);
    });

    it('returns true when coverage is 100%', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 1.0 }
      );
      assert.strictEqual(result, true);
    });
  });
});
