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
        pixelsInRegions: 0,
        totalPixels: 0,
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
        pixelsInRegions: 0,
        totalPixels: 0,
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

    it('calculates 100% coverage when all clusters match confirmed region centers', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 45, y: 45, width: 10, height: 10 } },
          { boundingBox: { x: 50, y: 45, width: 10, height: 10 } },
        ],
        [{ x1: 45, y1: 45, x2: 55, y2: 55 }]
      );

      assert.strictEqual(result.coverage, 1);
      assert.strictEqual(result.clustersInRegions, 2);
      assert.strictEqual(result.totalClusters, 2);
    });

    it('calculates 0% coverage when no clusters match confirmed region centers', () => {
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

    it('calculates 0% coverage when a cluster intersects but center does not match', () => {
      let result = calculateRegionCoverage(
        [{ boundingBox: { x: 90, y: 90, width: 20, height: 20 } }],
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }]
      );

      assert.strictEqual(result.coverage, 0);
      assert.strictEqual(result.clustersInRegions, 0);
      assert.strictEqual(result.totalClusters, 1);
    });

    it('calculates 50% coverage when half the changed pixels match region centers', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 45, y: 45, width: 10, height: 10 } },
          { boundingBox: { x: 200, y: 200, width: 10, height: 10 } },
        ],
        [{ x1: 45, y1: 45, x2: 55, y2: 55 }]
      );

      assert.strictEqual(result.coverage, 0.5);
      assert.strictEqual(result.clustersInRegions, 1);
      assert.strictEqual(result.totalClusters, 2);
    });

    it('weights coverage by changed pixels instead of cluster count', () => {
      let result = calculateRegionCoverage(
        [
          {
            boundingBox: { x: 45, y: 45, width: 10, height: 10 },
            pixelCount: 100,
          },
          {
            boundingBox: { x: 200, y: 200, width: 100, height: 100 },
            pixelCount: 900,
          },
        ],
        [{ x1: 45, y1: 45, x2: 55, y2: 55 }]
      );

      assert.strictEqual(result.clustersInRegions, 1);
      assert.strictEqual(result.totalClusters, 2);
      assert.strictEqual(result.pixelsInRegions, 100);
      assert.strictEqual(result.totalPixels, 1000);
      assert.strictEqual(result.coverage, 0.1);
    });

    it('handles multiple regions', () => {
      let result = calculateRegionCoverage(
        [
          { boundingBox: { x: 45, y: 45, width: 10, height: 10 } },
          { boundingBox: { x: 245, y: 245, width: 10, height: 10 } },
        ],
        [
          { id: 'region-1', x1: 45, y1: 45, x2: 55, y2: 55 },
          { id: 'region-2', x1: 245, y1: 245, x2: 255, y2: 255 },
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
        [{ boundingBox: { x: 45, y: 45, width: 10, height: 10 } }],
        [{ id: 'timestamp-region', x1: 45, y1: 45, x2: 55, y2: 55 }]
      );

      assert.deepStrictEqual(result.matchedRegions, ['timestamp-region']);
    });

    it('tracks matched region labels when no id', () => {
      let result = calculateRegionCoverage(
        [{ boundingBox: { x: 45, y: 45, width: 10, height: 10 } }],
        [{ label: 'avatar', x1: 45, y1: 45, x2: 55, y2: 55 }]
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

    it('returns false when coverage is below cloud threshold', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.89 },
        { ssimScore: 0.99 }
      );
      assert.strictEqual(result, false);
    });

    it('returns false when SSIM is below cloud threshold', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 1 },
        { ssimScore: 0.94 }
      );
      assert.strictEqual(result, false);
    });

    it('returns false when SSIM is missing', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 1 }
      );
      assert.strictEqual(result, false);
    });

    it('returns true when coverage and SSIM meet cloud thresholds', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.9 },
        { ssimScore: 0.95 }
      );
      assert.strictEqual(result, true);
    });

    it('returns true when coverage and SSIM are above cloud thresholds', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.95 },
        { ssimScore: 0.99 }
      );
      assert.strictEqual(result, true);
    });

    it('supports custom thresholds', () => {
      let result = shouldAutoApproveFromRegions(
        [{ x1: 0, y1: 0, x2: 100, y2: 100 }],
        { coverage: 0.8 },
        { ssimScore: 0.9, coverageThreshold: 0.8, ssimThreshold: 0.9 }
      );
      assert.strictEqual(result, true);
    });
  });
});
