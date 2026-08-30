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
    it('builds a failed comparison with Honeydiff evidence', () => {
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
      assert.deepStrictEqual(result.diffClusters, []);
    });

    it('ignores stale hotspot and region inputs instead of auto-passing a diff', () => {
      let result = buildFailedComparison({
        name: 'stale-cache',
        signature: 'stale-cache|1920|chrome',
        baselinePath: '/baselines/stale-cache.png',
        currentPath: '/current/stale-cache.png',
        diffPath: '/diffs/stale-cache.png',
        properties: {},
        threshold: 2.0,
        minClusterSize: 2,
        honeydiffResult: {
          diffPercentage: 2.0,
          diffPixels: 20000,
          totalPixels: 1000000,
          diffClusters: [
            { boundingBox: { x: 10, y: 100, width: 50, height: 50 } },
          ],
        },
        hotspotAnalysis: {
          confidence: 'high',
          confidence_score: 100,
          regions: [{ y1: 0, y2: 1000 }],
        },
        regionData: {
          confirmed: [{ id: 'region-1', x1: 0, y1: 0, x2: 1000, y2: 1000 }],
        },
      });

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.reason, 'pixel-diff');
      assert.ok(!Object.hasOwn(result, 'hotspotAnalysis'));
      assert.ok(!Object.hasOwn(result, 'regionAnalysis'));
      assert.ok(!Object.hasOwn(result, 'confirmedRegions'));
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
      let error = new Error(
        "Image dimensions don't match: 1920x1080 vs 1920x1200"
      );

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
