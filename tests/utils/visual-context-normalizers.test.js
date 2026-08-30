import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeBuildContext,
  normalizeComparisonGroup,
} from '../../src/utils/visual-context-normalizers.js';

describe('visual context normalizers', () => {
  it('groups complete comparisons without losing visual evidence', () => {
    let context = normalizeBuildContext({
      groups: [
        {
          name: 'Checkout',
          total_variants: 2,
          comparisons: [
            { id: 'comparison-mobile' },
            { id: 'comparison-desktop' },
          ],
        },
      ],
      comparisons: [
        {
          id: 'comparison-mobile',
          result: 'changed',
          visual_review: { state: 'pending' },
          screenshot: {
            id: 'current-mobile',
            name: 'Checkout',
            browser: 'chromium',
            viewport: { width: 375, height: 667 },
            bitmap: { width: 398, height: 2942 },
            metadata: { properties: { scenario: 'long-cart' } },
            signature: 'Checkout|375|chromium|long-cart',
            url: 'https://cdn.test/current.png',
            baseline: {
              id: 'baseline-mobile',
              build_id: 'baseline-build',
              url: 'https://cdn.test/baseline.png',
            },
          },
          diff: {
            image_url: 'https://cdn.test/diff.png',
            percentage: 2.5,
            fingerprint_hash: 'fp-checkout',
            details: { clusters: { count: 2 } },
            artifacts: {
              diff_mask: {
                available: true,
                complete: true,
                download_url:
                  '/api/sdk/context/comparisons/comparison-mobile/diff-mask',
                digest: `sha256:${'a'.repeat(64)}`,
                pixel_count: 321,
              },
            },
          },
        },
        {
          id: 'comparison-desktop',
          result: 'identical',
          visual_review: { state: 'approved' },
          screenshot: {
            id: 'current-desktop',
            name: 'Checkout',
            baseline: {},
          },
          diff: {},
        },
      ],
    });

    assert.strictEqual(context.groups.length, 1);
    let group = context.groups[0];
    let comparison = group.variants[0];

    assert.strictEqual(group.name, 'Checkout');
    assert.strictEqual(group.variant_count, 2);
    assert.strictEqual(group.variants_complete, true);
    assert.strictEqual(group.aggregate_status.needs_review_count, 1);
    assert.strictEqual(group.aggregate_status.has_changes, true);
    assert.strictEqual(comparison.review_state, 'pending');
    assert.deepStrictEqual(comparison.screenshot.viewport, {
      width: 375,
      height: 667,
    });
    assert.deepStrictEqual(comparison.screenshot.bitmap, {
      width: 398,
      height: 2942,
    });
    assert.deepStrictEqual(comparison.screenshot.metadata, {
      properties: { scenario: 'long-cart' },
    });
    assert.strictEqual(
      comparison.screenshot.signature,
      'Checkout|375|chromium|long-cart'
    );
    assert.strictEqual(
      comparison.screenshot.url,
      'https://cdn.test/current.png'
    );
    assert.strictEqual(
      comparison.baseline.url,
      'https://cdn.test/baseline.png'
    );
    assert.strictEqual(comparison.diff.image_url, 'https://cdn.test/diff.png');
    assert.strictEqual(comparison.diff.fingerprint_hash, 'fp-checkout');
    assert.strictEqual(comparison.diff.region_count, 2);
    assert.deepStrictEqual(comparison.diff.details, {
      clusters: { count: 2 },
    });
    assert.deepStrictEqual(comparison.diff.artifacts, {
      diff_mask: {
        available: true,
        complete: true,
        download_url:
          '/api/sdk/context/comparisons/comparison-mobile/diff-mask',
        digest: `sha256:${'a'.repeat(64)}`,
        pixel_count: 321,
      },
    });
  });

  it('keeps explicit grouped false and zero values unchanged', () => {
    let group = normalizeComparisonGroup({
      name: 'Checkout',
      total_variants: 8,
      aggregate_status: {
        has_changes: false,
        has_new: false,
        all_approved: true,
        needs_review: false,
        needs_review_count: 0,
        failed_count: 0,
        has_rejected: false,
        max_diff_percentage: 0,
      },
      comparisons: [
        {
          id: 'partial-variant',
          result: 'changed',
          visual_review: { state: 'pending' },
          screenshot: { name: 'Checkout', baseline: {} },
          diff: {},
        },
      ],
    });

    assert.strictEqual(group.variants_complete, false);
    assert.deepStrictEqual(group.aggregate_status, {
      has_changes: false,
      has_new: false,
      all_approved: true,
      needs_review: false,
      needs_review_count: 0,
      failed_count: 0,
      has_rejected: false,
      max_diff_percentage: 0,
    });

    let partialWithoutAggregates = normalizeComparisonGroup({
      name: 'Partial checkout',
      total_variants: 8,
      comparisons: [
        {
          id: 'partial-variant',
          result: 'changed',
          visual_review: { state: 'pending' },
          screenshot: { name: 'Partial checkout', baseline: {} },
          diff: {},
        },
      ],
    });

    assert.strictEqual(
      partialWithoutAggregates.aggregate_status.needs_review_count,
      null
    );
    assert.strictEqual(
      partialWithoutAggregates.aggregate_status.failed_count,
      null
    );
    assert.strictEqual(
      partialWithoutAggregates.aggregate_status.max_diff_percentage,
      null
    );
  });

  it('joins grouped variants to exact API comparison evidence by ID', () => {
    let context = normalizeBuildContext({
      groups: [
        {
          name: 'Public build detail',
          total_variants: 1,
          comparisons: [
            {
              id: 'comparison-1',
            },
          ],
        },
      ],
      comparisons: [
        {
          id: 'comparison-1',
          result: 'changed',
          status: 'completed',
          visual_review: { state: 'pending' },
          needs_review: true,
          screenshot: {
            id: 'screenshot-1',
            name: 'public-build-detail-approved',
            browser: 'chrome',
            signature: 'public-build-detail-approved|1440|chrome',
            url: 'https://cdn.test/current.png',
            baseline: {
              id: 'baseline-1',
              build_id: 'baseline-build',
              name: 'public-build-detail-approved',
              url: 'https://cdn.test/baseline.png',
            },
          },
          diff: {
            percentage: 0.52,
            changed_pixels: 120,
            total_pixels: 2221440,
            fingerprint_hash: 'fingerprint-1',
          },
        },
      ],
    });

    let comparison = context.groups[0].variants[0];
    assert.strictEqual(comparison.id, 'comparison-1');
    assert.strictEqual(comparison.name, 'public-build-detail-approved');
    assert.strictEqual(comparison.status, 'completed');
    assert.strictEqual(comparison.screenshot.id, 'screenshot-1');
    assert.strictEqual(
      comparison.screenshot.signature,
      'public-build-detail-approved|1440|chrome'
    );
    assert.strictEqual(comparison.baseline.id, 'baseline-1');
    assert.strictEqual(
      comparison.baseline.name,
      'public-build-detail-approved'
    );
    assert.strictEqual(comparison.diff.total_pixels, 2221440);
    assert.strictEqual(comparison.diff.fingerprint_hash, 'fingerprint-1');
  });

  it('preserves aggregate-only review facts and failed capture evidence', () => {
    let context = normalizeBuildContext({
      groups: [
        {
          name: 'Payment',
          total_variants: 8,
          aggregate_status: {
            needs_review: true,
            needs_review_count: 3,
            failed_count: 2,
          },
          comparisons: [],
        },
      ],
      screenshots: [
        {
          id: 'failed-capture',
          name: 'Settings',
          status: 'failed',
          error_message: 'Browser render failed',
          browser: 'webkit',
          viewport: { width: 1280, height: 720 },
          bitmap: { width: 1280, height: 900 },
          metadata: { route: '/settings' },
          signature: 'Settings|1280|webkit',
          url: 'https://cdn.test/failed-current.png',
        },
      ],
    });

    assert.strictEqual(
      context.groups[0].aggregate_status.needs_review_count,
      3
    );
    assert.strictEqual(context.groups[0].aggregate_status.failed_count, 2);
    assert.strictEqual(context.failed_captures.length, 1);
    assert.strictEqual(
      context.failed_captures[0].error_message,
      'Browser render failed'
    );
    assert.deepStrictEqual(context.failed_captures[0].screenshot.bitmap, {
      width: 1280,
      height: 900,
    });
    assert.strictEqual(
      context.failed_captures[0].screenshot.url,
      'https://cdn.test/failed-current.png'
    );
  });
});
