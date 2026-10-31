import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  rollbackComparisonActions,
  runBatchMutation,
  updateComparisonsUserAction,
} from './batch-mutations.js';

describe('review batch mutations', () => {
  it('applies user action to matching comparisons', () => {
    let data = {
      comparisons: [
        { id: 'a', name: 'alpha', userAction: null },
        { id: 'b', name: 'beta', userAction: null },
      ],
    };

    let updated = updateComparisonsUserAction(data, ['beta'], 'accepted');

    assert.strictEqual(updated.comparisons[0].userAction, null);
    assert.strictEqual(updated.comparisons[1].userAction, 'accepted');
  });

  it('rolls back only the failed action while preserving newer server data', () => {
    let previous = {
      comparisons: [
        { id: 'a', name: 'alpha', status: 'failed', userAction: null },
        { id: 'b', name: 'beta', status: 'failed', userAction: null },
      ],
    };
    let current = {
      timestamp: 2,
      comparisons: [
        { id: 'a', name: 'alpha', status: 'passed', userAction: 'accepted' },
        {
          id: 'b',
          name: 'beta',
          status: 'failed',
          diffPercentage: 3,
          userAction: 'accepted',
        },
        { id: 'c', name: 'new capture', status: 'new' },
      ],
    };

    let restored = rollbackComparisonActions(
      current,
      previous,
      ['b'],
      'accepted'
    );

    assert.strictEqual(restored.timestamp, 2);
    assert.strictEqual(restored.comparisons.length, 3);
    assert.strictEqual(restored.comparisons[0].userAction, 'accepted');
    assert.strictEqual(restored.comparisons[1].userAction, null);
    assert.strictEqual(restored.comparisons[1].diffPercentage, 3);
    assert.deepStrictEqual(previous.comparisons[1], {
      id: 'b',
      name: 'beta',
      status: 'failed',
      userAction: null,
    });
  });

  it('does not restore deleted captures or overwrite later actions', () => {
    let previous = {
      comparisons: [
        { id: 'a', name: 'alpha' },
        { id: 'b', name: 'beta' },
      ],
    };
    let current = {
      comparisons: [
        { id: 'b', name: 'beta', status: 'rejected', userAction: 'rejected' },
      ],
    };
    let restored = rollbackComparisonActions(
      current,
      previous,
      ['a', 'b'],
      'accepted'
    );
    assert.deepStrictEqual(restored, current);
    let optimistic = { comparisons: [{ id: 'a', userAction: 'accepted' }] };
    assert.deepStrictEqual(
      rollbackComparisonActions(optimistic, previous, ['a'], 'accepted'),
      { comparisons: [{ id: 'a' }] }
    );
  });

  it('returns success metadata when all mutations succeed', async () => {
    let result = await runBatchMutation(
      ['a', null, '', 'b'],
      async id => ({ ok: true, id }),
      'accept'
    );

    assert.deepStrictEqual(result.succeededIds, ['a', 'b']);
    assert.deepStrictEqual(result.failedIds, []);
    assert.deepStrictEqual(result.errors, []);
  });

  it('throws rich error metadata on partial failure', async () => {
    await assert.rejects(
      runBatchMutation(
        ['a', 'b', 'c'],
        async id => {
          if (id === 'b') {
            throw new Error('boom');
          }
          return { ok: true, id };
        },
        'accept'
      ),
      error => {
        assert.strictEqual(error.name, 'BatchMutationError');
        assert.strictEqual(error.action, 'accept');
        assert.deepStrictEqual(error.succeededIds, ['a', 'c']);
        assert.deepStrictEqual(error.failedIds, ['b']);
        assert.strictEqual(error.errors.length, 1);
        assert.strictEqual(error.errors[0].id, 'b');
        assert.match(error.message, /failed to accept/i);
        return true;
      }
    );
  });
});
