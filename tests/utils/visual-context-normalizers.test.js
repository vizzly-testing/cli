import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  groupComparisonsByScreenshot,
  normalizeBuildContext,
  normalizeComparisonGroup,
  normalizeComparisonRecord,
  summarizeComparisonGroups,
} from '../../src/utils/visual-context-normalizers.js';

describe('utils/visual-context-normalizers', () => {
  it('normalizes mixed comparison records into one factual shape', () => {
    let record = normalizeComparisonRecord({
      id: 'cmp-1',
      screenshot_name: 'Dashboard',
      result: 'changed',
      needs_review: true,
      metadata: { browser: 'chrome' },
      viewport_width: 1440,
      viewport_height: 900,
      diff: {
        percentage: '1.25',
        fingerprint_hash: 'fp-dashboard',
        regions: [{ pixelCount: 100 }],
      },
      screenshot: {
        id: 'ss-1',
        original_url: 'https://cdn.test/current.png',
      },
      baseline: {
        id: 'base-ss-1',
        build_id: 'baseline-1',
        original_url: 'https://cdn.test/baseline.png',
      },
    });

    assert.strictEqual(record.id, 'cmp-1');
    assert.strictEqual(record.name, 'Dashboard');
    assert.strictEqual(record.browser, 'chrome');
    assert.strictEqual(record.viewport.display, '1440×900');
    assert.strictEqual(record.diff.percentage, 1.25);
    assert.strictEqual(record.diff.region_count, 1);
    assert.strictEqual(record.diff.regions, undefined);
    assert.strictEqual(record.baseline.build_id, 'baseline-1');
  });

  it('keeps raw diff geometry behind the detail option', () => {
    let record = normalizeComparisonRecord(
      {
        id: 'cmp-1',
        screenshot_name: 'Dashboard',
        result: 'changed',
        diff: {
          percentage: '1.25',
          regions: [{ pixelCount: 100 }],
          cluster_metadata: { clusterCount: 1 },
        },
      },
      { includeDetails: true }
    );

    assert.deepStrictEqual(record.diff.regions, [{ pixelCount: 100 }]);
    assert.deepStrictEqual(record.diff.cluster_metadata, { clusterCount: 1 });
  });

  it('groups flat comparisons by screenshot and preserves server-provided groups', () => {
    let context = normalizeBuildContext({
      build: { id: 'build-1' },
      comparisons: [
        {
          id: 'desktop',
          screenshot_name: 'Dashboard',
          result: 'identical',
          metadata: { browser: 'chrome' },
          viewport_width: 1440,
          viewport_height: 900,
        },
        {
          id: 'mobile',
          screenshot_name: 'Dashboard',
          result: 'changed',
          browser: 'webkit',
          viewport_width: 390,
          viewport_height: 844,
          diff_percentage: 4.2,
        },
        {
          id: 'settings',
          screenshot_name: 'Settings',
          result: 'new',
        },
      ],
    });

    assert.strictEqual(context.groups.length, 2);
    assert.strictEqual(context.groups[0].name, 'Dashboard');
    assert.strictEqual(context.groups[0].primary_variant.id, 'desktop');
    assert.strictEqual(context.groups[0].variants.length, 2);
    assert.strictEqual(context.groups[0].aggregate_status.has_changes, true);
    assert.strictEqual(context.groups[1].aggregate_status.has_new, true);
    assert.deepStrictEqual(summarizeComparisonGroups(context.groups), {
      total: 2,
      changed: 1,
      new: 1,
      rejected: 0,
      flaky: 0,
      max_diff_percentage: 4.2,
    });
  });

  it('normalizes compact server group summaries without needing flat comparisons', () => {
    let group = normalizeComparisonGroup({
      name: 'Dashboard',
      variant_count: 1,
      primary_variant: {
        id: 'cmp-1',
        name: 'Dashboard',
        browser: 'chrome',
        viewport: { width: 1440, height: 900, display: '1440×900' },
        result: 'changed',
        diff_percentage: 2.5,
      },
      variants: [
        {
          id: 'cmp-1',
          name: 'Dashboard',
          browser: 'chrome',
          viewport: { width: 1440, height: 900, display: '1440×900' },
          result: 'changed',
          diff_percentage: 2.5,
        },
      ],
      aggregate_status: {
        has_changes: true,
        has_new: false,
        max_diff_percentage: 2.5,
        status_priority: 2,
      },
    });

    assert.strictEqual(group.name, 'Dashboard');
    assert.strictEqual(group.variant_count, 1);
    assert.strictEqual(group.primary_variant.id, 'cmp-1');
    assert.strictEqual(group.aggregate_status.has_changes, true);
  });

  it('supports direct grouping helper calls', () => {
    let groups = groupComparisonsByScreenshot([
      { id: 'cmp-1', screenshot_name: 'Dashboard', result: 'changed' },
    ]);

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].name, 'Dashboard');
  });
});
