import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  asIdList,
  restoreComparisonsFromPrevious,
  runBatchMutation,
  updateComparisonsUserAction,
} from '../../src/reporter/src/hooks/queries/batch-mutation-utils.js';

describe('reporter batch mutation utils', () => {
  it('normalizes ids into a list', () => {
    assert.deepStrictEqual(asIdList('abc'), ['abc']);
    assert.deepStrictEqual(asIdList(['a', null, '', 'b']), ['a', 'b']);
    assert.deepStrictEqual(asIdList(undefined), []);
  });

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

  it('restores only failed ids from previous data', () => {
    let previous = {
      comparisons: [
        { id: 'a', name: 'alpha', userAction: null },
        { id: 'b', name: 'beta', userAction: null },
      ],
    };
    let optimistic = {
      comparisons: [
        { id: 'a', name: 'alpha', userAction: 'accepted' },
        { id: 'b', name: 'beta', userAction: 'accepted' },
      ],
    };

    let restored = restoreComparisonsFromPrevious(optimistic, previous, ['b']);

    assert.strictEqual(restored.comparisons[0].userAction, 'accepted');
    assert.strictEqual(restored.comparisons[1].userAction, null);
  });

  it('returns success metadata when all mutations succeed', async () => {
    let result = await runBatchMutation(
      ['a', 'b'],
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
