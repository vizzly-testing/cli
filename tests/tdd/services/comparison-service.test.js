import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildErrorComparison,
  buildFailedComparison,
  buildNewComparison,
  buildPassedComparison,
  isDimensionMismatchError,
} from '../../../src/tdd/services/comparison-service.js';

describe('tdd/services/comparison-service', () => {
  describe('buildPassedComparison', () => {
    it('builds passed comparison with all fields', () => {
      let result = buildPassedComparison({
        name: 'homepage',
        signature: 'homepage|1920|chrome',
        baselinePath: '/baselines/homepage.png',
        currentPath: '/current/homepage.png',
        properties: { viewport_width: 1920, browser: 'chrome' },
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          totalPixels: 1000000,
          aaPixelsIgnored: 500,
          aaPercentage: 0.05,
        },
      });

      assert.strictEqual(result.status, 'passed');
      assert.strictEqual(result.name, 'homepage');
      assert.strictEqual(result.signature, 'homepage|1920|chrome');
      assert.strictEqual(result.baseline, '/baselines/homepage.png');
      assert.strictEqual(result.current, '/current/homepage.png');
      assert.strictEqual(result.diff, null);
      assert.strictEqual(result.threshold, 2.0);
      assert.strictEqual(result.minClusterSize, 2);
      assert.strictEqual(result.totalPixels, 1000000);
      assert.strictEqual(result.aaPixelsIgnored, 500);
      assert.strictEqual(result.aaPercentage, 0.05);
      assert.ok(result.id); // Has generated ID
    });

    it('handles missing honeydiff metrics', () => {
      let result = buildPassedComparison({
        name: 'test',
        signature: 'test|1920|chrome',
        baselinePath: '/baselines/test.png',
        currentPath: '/current/test.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
      });

      assert.strictEqual(result.totalPixels, undefined);
      assert.strictEqual(result.aaPixelsIgnored, undefined);
    });
  });

  describe('buildNewComparison', () => {
    it('builds new comparison for first-time screenshot', () => {
      let result = buildNewComparison({
        name: 'new-page',
        signature: 'new-page|1920|chrome',
        baselinePath: '/baselines/new-page.png',
        currentPath: '/current/new-page.png',
        properties: { viewport_width: 1920 },
      });

      assert.strictEqual(result.status, 'new');
      assert.strictEqual(result.name, 'new-page');
      assert.strictEqual(result.diff, null);
      assert.ok(result.id);
    });
  });

  describe('buildFailedComparison', () => {
    it('builds failed comparison with diff info', () => {
      let result = buildFailedComparison({
        name: 'login',
        signature: 'login|1920|chrome',
        baselinePath: '/baselines/login.png',
        currentPath: '/current/login.png',
        diffPath: '/diffs/login.png',
        properties: { viewport_width: 1920 },
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          diffPercentage: 5.5,
          diffPixels: 55000,
          totalPixels: 1000000,
          aaPixelsIgnored: 100,
          aaPercentage: 0.01,
          boundingBox: { x: 100, y: 200, width: 300, height: 400 },
          heightDiff: 0,
          intensityStats: { mean: 45.2 },
          diffClusters: [],
        },
        hotspotAnalysis: null,
      });

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.name, 'login');
      assert.strictEqual(result.diff, '/diffs/login.png');
      assert.strictEqual(result.diffPercentage, 5.5);
      assert.strictEqual(result.diffCount, 55000);
      assert.strictEqual(result.reason, 'pixel-diff');
      assert.deepStrictEqual(result.boundingBox, {
        x: 100,
        y: 200,
        width: 300,
        height: 400,
      });
      assert.strictEqual(result.hotspotAnalysis, null);
    });

    it('filters as passed when hotspot coverage is high', () => {
      let result = buildFailedComparison({
        name: 'dynamic-content',
        signature: 'dynamic-content|1920|chrome',
        baselinePath: '/baselines/dynamic.png',
        currentPath: '/current/dynamic.png',
        diffPath: '/diffs/dynamic.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          diffPercentage: 2.0,
          diffPixels: 20000,
          totalPixels: 1000000,
          diffClusters: [
            { boundingBox: { y: 100, height: 50 } }, // Line 100-149
          ],
        },
        hotspotAnalysis: {
          confidence: 'high',
          regions: [{ y1: 50, y2: 250 }], // Covers lines 50-250
        },
      });

      // Should be filtered as passed because hotspot coverage >= 80%
      assert.strictEqual(result.status, 'passed');
      assert.strictEqual(result.reason, 'hotspot-filtered');
      assert.ok(result.hotspotAnalysis);
      assert.strictEqual(result.hotspotAnalysis.isFiltered, true);
    });

    it('remains failed when hotspot coverage is low', () => {
      let result = buildFailedComparison({
        name: 'real-diff',
        signature: 'real-diff|1920|chrome',
        baselinePath: '/baselines/real.png',
        currentPath: '/current/real.png',
        diffPath: '/diffs/real.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          diffPercentage: 10.0,
          diffPixels: 100000,
          totalPixels: 1000000,
          diffClusters: [
            { boundingBox: { y: 500, height: 100 } }, // Line 500-599 (outside hotspot)
          ],
        },
        hotspotAnalysis: {
          confidence: 'high',
          regions: [{ y1: 50, y2: 100 }], // Only covers lines 50-100
        },
      });

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.reason, 'pixel-diff');
      assert.ok(result.hotspotAnalysis);
      assert.strictEqual(result.hotspotAnalysis.isFiltered, false);
    });

    it('remains failed when hotspot confidence is low', () => {
      let result = buildFailedComparison({
        name: 'low-confidence',
        signature: 'low-confidence|1920|chrome',
        baselinePath: '/baselines/low.png',
        currentPath: '/current/low.png',
        diffPath: '/diffs/low.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          diffPercentage: 2.0,
          diffPixels: 20000,
          totalPixels: 1000000,
          diffClusters: [{ boundingBox: { y: 100, height: 50 } }],
        },
        hotspotAnalysis: {
          confidence: 'low', // Not high confidence
          regions: [{ y1: 50, y2: 250 }],
        },
      });

      assert.strictEqual(result.status, 'failed');
    });

    it('uses confidence_score when available', () => {
      let result = buildFailedComparison({
        name: 'score-based',
        signature: 'score-based|1920|chrome',
        baselinePath: '/baselines/score.png',
        currentPath: '/current/score.png',
        diffPath: '/diffs/score.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          diffPercentage: 2.0,
          diffPixels: 20000,
          totalPixels: 1000000,
          diffClusters: [{ boundingBox: { y: 100, height: 50 } }],
        },
        hotspotAnalysis: {
          confidence_score: 75, // >= 70 is high
          regions: [{ y1: 50, y2: 250 }],
        },
      });

      assert.strictEqual(result.status, 'passed');
      assert.strictEqual(result.reason, 'hotspot-filtered');
    });
  });

  describe('buildErrorComparison', () => {
    it('builds error comparison with message', () => {
      let result = buildErrorComparison({
        name: 'broken',
        signature: 'broken|1920|chrome',
        baselinePath: '/baselines/broken.png',
        currentPath: '/current/broken.png',
        properties: {},
        errorMessage: 'Image dimensions do not match',
      });

      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.name, 'broken');
      assert.strictEqual(result.error, 'Image dimensions do not match');
      assert.strictEqual(result.diff, null);
    });
  });

  describe('isDimensionMismatchError', () => {
    it('returns true for dimension mismatch error', () => {
      let error = new Error("Image dimensions don't match: 1920x1080 vs 1920x1200");

      assert.strictEqual(isDimensionMismatchError(error), true);
    });

    it('returns false for other errors', () => {
      let error = new Error('File not found');

      assert.strictEqual(isDimensionMismatchError(error), false);
    });

    it('returns false for error without message', () => {
      let error = {};

      assert.strictEqual(isDimensionMismatchError(error), false);
    });
  });
});
