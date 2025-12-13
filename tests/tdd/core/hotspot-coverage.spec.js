/**
 * Tests for hotspot coverage calculation pure functions
 *
 * These tests require NO mocking - they test pure functions with input/output assertions.
 */

import { describe, expect, it } from 'vitest';
import {
  calculateHotspotCoverage,
  shouldFilterAsHotspot,
} from '../../../src/tdd/core/hotspot-coverage.js';

describe('hotspot-coverage', () => {
  describe('calculateHotspotCoverage', () => {
    it('returns zero coverage when diffClusters is empty', () => {
      let result = calculateHotspotCoverage([], {
        regions: [{ y1: 10, y2: 20 }],
      });

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when diffClusters is null', () => {
      let result = calculateHotspotCoverage(null, {
        regions: [{ y1: 10, y2: 20 }],
      });

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when hotspotAnalysis is null', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 10, height: 5 } }],
        null
      );

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when hotspotAnalysis has no regions', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 10, height: 5 } }],
        { regions: [] }
      );

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('returns zero coverage when clusters have no bounding boxes', () => {
      let result = calculateHotspotCoverage([{ pixels: 100 }, { pixels: 50 }], {
        regions: [{ y1: 10, y2: 20 }],
      });

      expect(result).toEqual({
        coverage: 0,
        linesInHotspots: 0,
        totalLines: 0,
      });
    });

    it('calculates 100% coverage when all diff is in hotspot', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 15, height: 5 } }], // Lines 15-19
        { regions: [{ y1: 10, y2: 25 }] } // Covers lines 10-25
      );

      expect(result.coverage).toBe(1);
      expect(result.linesInHotspots).toBe(5);
      expect(result.totalLines).toBe(5);
    });

    it('calculates 0% coverage when no diff is in hotspot', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 100, height: 10 } }], // Lines 100-109
        { regions: [{ y1: 10, y2: 20 }] } // Covers lines 10-20
      );

      expect(result.coverage).toBe(0);
      expect(result.linesInHotspots).toBe(0);
      expect(result.totalLines).toBe(10);
    });

    it('calculates partial coverage correctly', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 15, height: 10 } }], // Lines 15-24
        { regions: [{ y1: 10, y2: 19 }] } // Covers lines 10-19 (5 of 10 lines)
      );

      expect(result.coverage).toBe(0.5);
      expect(result.linesInHotspots).toBe(5);
      expect(result.totalLines).toBe(10);
    });

    it('handles multiple diff clusters', () => {
      let result = calculateHotspotCoverage(
        [
          { boundingBox: { y: 10, height: 5 } }, // Lines 10-14 (in hotspot)
          { boundingBox: { y: 100, height: 5 } }, // Lines 100-104 (not in hotspot)
        ],
        { regions: [{ y1: 0, y2: 20 }] }
      );

      expect(result.coverage).toBe(0.5); // 5 of 10 lines
      expect(result.linesInHotspots).toBe(5);
      expect(result.totalLines).toBe(10);
    });

    it('handles multiple hotspot regions', () => {
      let result = calculateHotspotCoverage(
        [
          { boundingBox: { y: 10, height: 5 } }, // Lines 10-14
          { boundingBox: { y: 50, height: 5 } }, // Lines 50-54
        ],
        {
          regions: [
            { y1: 0, y2: 20 }, // Covers first cluster
            { y1: 45, y2: 60 }, // Covers second cluster
          ],
        }
      );

      expect(result.coverage).toBe(1);
      expect(result.linesInHotspots).toBe(10);
      expect(result.totalLines).toBe(10);
    });

    it('deduplicates overlapping diff lines', () => {
      let result = calculateHotspotCoverage(
        [
          { boundingBox: { y: 10, height: 10 } }, // Lines 10-19
          { boundingBox: { y: 15, height: 10 } }, // Lines 15-24 (overlaps)
        ],
        { regions: [{ y1: 0, y2: 50 }] }
      );

      // Should have 15 unique lines (10-24)
      expect(result.totalLines).toBe(15);
      expect(result.linesInHotspots).toBe(15);
      expect(result.coverage).toBe(1);
    });

    it('handles boundary conditions for region matching', () => {
      let result = calculateHotspotCoverage(
        [{ boundingBox: { y: 10, height: 1 } }], // Just line 10
        { regions: [{ y1: 10, y2: 10 }] } // Region exactly at line 10
      );

      expect(result.coverage).toBe(1);
      expect(result.linesInHotspots).toBe(1);
      expect(result.totalLines).toBe(1);
    });
  });

  describe('shouldFilterAsHotspot', () => {
    it('returns false when hotspotAnalysis is null', () => {
      let result = shouldFilterAsHotspot(null, { coverage: 0.9 });

      expect(result).toBe(false);
    });

    it('returns false when coverageResult is null', () => {
      let result = shouldFilterAsHotspot({ confidence: 'high' }, null);

      expect(result).toBe(false);
    });

    it('returns false when coverage is below 80%', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'high' },
        { coverage: 0.79 }
      );

      expect(result).toBe(false);
    });

    it('returns true when coverage >= 80% and confidence is high', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'high' },
        { coverage: 0.8 }
      );

      expect(result).toBe(true);
    });

    it('returns true when coverage >= 80% and confidenceScore > 0.7', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'medium', confidenceScore: 0.75 },
        { coverage: 0.85 }
      );

      expect(result).toBe(true);
    });

    it('returns false when coverage >= 80% but confidence is low and score <= 0.7', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'low', confidenceScore: 0.5 },
        { coverage: 0.9 }
      );

      expect(result).toBe(false);
    });

    it('returns false when coverage >= 80% but no confidence info', () => {
      let result = shouldFilterAsHotspot(
        { regions: [{ y1: 10, y2: 20 }] }, // No confidence fields
        { coverage: 0.9 }
      );

      expect(result).toBe(false);
    });

    it('handles exactly 80% coverage threshold', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'high' },
        { coverage: 0.8 }
      );

      expect(result).toBe(true);
    });

    it('handles exactly 0.7 confidence score (not filtered)', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'medium', confidenceScore: 0.7 },
        { coverage: 0.9 }
      );

      expect(result).toBe(false); // Must be > 0.7, not >=
    });

    it('handles just above 0.7 confidence score', () => {
      let result = shouldFilterAsHotspot(
        { confidence: 'medium', confidenceScore: 0.71 },
        { coverage: 0.9 }
      );

      expect(result).toBe(true);
    });
  });
});
