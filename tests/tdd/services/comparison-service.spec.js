/**
 * Tests for comparison service
 *
 * Pure builder function tests - no mocking needed.
 * The compareImages function would need honeydiff which requires real images.
 */

import { describe, expect, it } from 'vitest';
import {
  buildErrorComparison,
  buildFailedComparison,
  buildNewComparison,
  buildPassedComparison,
  isDimensionMismatchError,
} from '../../../src/tdd/services/comparison-service.js';

describe('comparison-service', () => {
  describe('buildPassedComparison', () => {
    it('builds a passed comparison result', () => {
      let result = buildPassedComparison({
        name: 'homepage',
        signature: 'homepage|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        properties: { viewport_width: 1920, browser: 'chrome' },
        threshold: 2.0,
        minClusterSize: 2,
      });

      expect(result.status).toBe('passed');
      expect(result.name).toBe('homepage');
      expect(result.baseline).toBe('/path/to/baseline.png');
      expect(result.current).toBe('/path/to/current.png');
      expect(result.diff).toBeNull();
      expect(result.id).toMatch(/^[a-f0-9]{16}$/);
      expect(result.threshold).toBe(2.0);
      expect(result.minClusterSize).toBe(2);
    });

    it('includes honeydiff metrics when provided', () => {
      let result = buildPassedComparison({
        name: 'homepage',
        signature: 'homepage|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          totalPixels: 1000000,
          aaPixelsIgnored: 500,
          aaPercentage: 0.05,
        },
      });

      expect(result.totalPixels).toBe(1000000);
      expect(result.aaPixelsIgnored).toBe(500);
      expect(result.aaPercentage).toBe(0.05);
    });
  });

  describe('buildNewComparison', () => {
    it('builds a new comparison result', () => {
      let result = buildNewComparison({
        name: 'new-page',
        signature: 'new-page|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        properties: { viewport_width: 1920 },
      });

      expect(result.status).toBe('new');
      expect(result.name).toBe('new-page');
      expect(result.diff).toBeNull();
      expect(result.id).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('buildFailedComparison', () => {
    it('builds a failed comparison result', () => {
      let result = buildFailedComparison({
        name: 'changed-page',
        signature: 'changed-page|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        diffPath: '/path/to/diff.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          isDifferent: true,
          diffPercentage: 5.5,
          diffPixels: 1000,
          totalPixels: 100000,
          aaPixelsIgnored: 50,
          aaPercentage: 0.05,
          boundingBox: { x: 10, y: 20, width: 100, height: 50 },
          diffClusters: [],
        },
      });

      expect(result.status).toBe('failed');
      expect(result.name).toBe('changed-page');
      expect(result.diff).toBe('/path/to/diff.png');
      expect(result.diffPercentage).toBe(5.5);
      expect(result.diffCount).toBe(1000);
      expect(result.reason).toBe('pixel-diff');
      expect(result.hotspotAnalysis).toBeNull();
    });

    it('filters as passed when in high-confidence hotspot region', () => {
      let result = buildFailedComparison({
        name: 'hotspot-page',
        signature: 'hotspot-page|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        diffPath: '/path/to/diff.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          isDifferent: true,
          diffPercentage: 2.0,
          diffPixels: 100,
          diffClusters: [{ boundingBox: { y: 50, height: 10 } }],
        },
        hotspotAnalysis: {
          confidence: 'high',
          regions: [{ y1: 45, y2: 65 }], // Covers the diff region
        },
      });

      expect(result.status).toBe('passed');
      expect(result.reason).toBe('hotspot-filtered');
      expect(result.hotspotAnalysis.isFiltered).toBe(true);
      expect(result.hotspotAnalysis.coverage).toBe(1);
    });

    it('stays failed when coverage below 80%', () => {
      let result = buildFailedComparison({
        name: 'partial-hotspot',
        signature: 'partial-hotspot|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        diffPath: '/path/to/diff.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          isDifferent: true,
          diffPercentage: 2.0,
          diffPixels: 100,
          diffClusters: [{ boundingBox: { y: 50, height: 10 } }],
        },
        hotspotAnalysis: {
          confidence: 'high',
          regions: [{ y1: 50, y2: 52 }], // Only covers 3 of 10 lines (30%)
        },
      });

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('pixel-diff');
      expect(result.hotspotAnalysis.isFiltered).toBe(false);
    });

    it('stays failed when confidence is low', () => {
      let result = buildFailedComparison({
        name: 'low-confidence',
        signature: 'low-confidence|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        diffPath: '/path/to/diff.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          isDifferent: true,
          diffPercentage: 2.0,
          diffPixels: 100,
          diffClusters: [{ boundingBox: { y: 50, height: 10 } }],
        },
        hotspotAnalysis: {
          confidence: 'low',
          confidence_score: 30,
          regions: [{ y1: 45, y2: 65 }], // Covers 100%
        },
      });

      expect(result.status).toBe('failed');
      expect(result.hotspotAnalysis.isFiltered).toBe(false);
    });

    it('filters as passed when confidence_score >= 70', () => {
      let result = buildFailedComparison({
        name: 'score-filtered',
        signature: 'score-filtered|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        diffPath: '/path/to/diff.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          isDifferent: true,
          diffPercentage: 2.0,
          diffPixels: 100,
          diffClusters: [{ boundingBox: { y: 50, height: 10 } }],
        },
        hotspotAnalysis: {
          confidence: 'medium',
          confidence_score: 75,
          regions: [{ y1: 45, y2: 65 }],
        },
      });

      expect(result.status).toBe('passed');
      expect(result.reason).toBe('hotspot-filtered');
    });
  });

  describe('buildErrorComparison', () => {
    it('builds an error comparison result', () => {
      let result = buildErrorComparison({
        name: 'broken-page',
        signature: 'broken-page|1920|chrome',
        baselinePath: '/path/to/baseline.png',
        currentPath: '/path/to/current.png',
        properties: {},
        errorMessage: 'Something went wrong',
      });

      expect(result.status).toBe('error');
      expect(result.name).toBe('broken-page');
      expect(result.error).toBe('Something went wrong');
      expect(result.diff).toBeNull();
    });
  });

  describe('isDimensionMismatchError', () => {
    it('returns true for dimension mismatch errors', () => {
      let error = new Error(
        "Image dimensions don't match: 1920x1080 vs 1280x720"
      );

      expect(isDimensionMismatchError(error)).toBe(true);
    });

    it('returns false for other errors', () => {
      let error = new Error('File not found');

      expect(isDimensionMismatchError(error)).toBe(false);
    });

    it('handles error without message', () => {
      let error = {};

      expect(isDimensionMismatchError(error)).toBe(false);
    });
  });
});
