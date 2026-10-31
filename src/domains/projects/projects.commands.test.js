import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateProjectsOptions } from './projects.commands.js';

describe('validateProjectsOptions', () => {
  it('accepts valid options', () => {
    assert.deepEqual(validateProjectsOptions({ limit: 20, offset: 0 }), []);
  });

  it('rejects malformed and out-of-range limits', () => {
    for (let limit of [Number('20abc'), 0, 251, 1.5]) {
      assert.ok(
        validateProjectsOptions({ limit }).includes(
          '--limit must be an integer between 1 and 250'
        )
      );
    }
  });

  it('rejects malformed and negative offsets', () => {
    for (let offset of [Number('1abc'), -1, 1.5]) {
      assert.ok(
        validateProjectsOptions({ offset }).includes(
          '--offset must be a non-negative integer'
        )
      );
    }
  });
});
