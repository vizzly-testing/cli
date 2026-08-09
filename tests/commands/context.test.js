import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  validateContextBuildOptions,
  validateContextComparisonOptions,
  validateContextReviewQueueOptions,
  validateContextScreenshotOptions,
  validateContextSimilarOptions,
} from '../../src/commands/context.js';

describe('commands/context', () => {
  describe('option validation', () => {
    it('accepts supported sources and compact agent options', () => {
      assert.deepStrictEqual(
        validateContextBuildOptions({
          source: 'cloud',
          include: 'screenshots,diffs,comments',
          offset: 0,
        }),
        []
      );
    });

    it('rejects unsupported sources and compact agent fields', () => {
      assert.deepStrictEqual(
        validateContextBuildOptions({
          source: 'moon',
          include: 'screenshots,logs',
        }),
        [
          '--source must be one of: auto, cloud, local',
          '--include must contain only: screenshots, diffs, comments',
        ]
      );
    });

    it('rejects invalid context limits and offsets', () => {
      assert.ok(
        validateContextComparisonOptions({ similarLimit: 51 }).includes(
          '--similar-limit must be an integer between 1 and 50'
        )
      );
      assert.ok(
        validateContextComparisonOptions({ recentLimit: 4.5 }).includes(
          '--recent-limit must be an integer between 1 and 50'
        )
      );
      assert.ok(
        validateContextReviewQueueOptions({ offset: -1 }).includes(
          '--offset must be a non-negative integer'
        )
      );
      assert.ok(
        validateContextSimilarOptions({ limit: 0 }).includes(
          '--limit must be an integer between 1 and 50'
        )
      );
    });

    it('requires a project when screenshot context is scoped to an organization', () => {
      assert.deepStrictEqual(
        validateContextScreenshotOptions({ org: 'acme' }),
        ['--org requires --project']
      );
    });
  });
});
