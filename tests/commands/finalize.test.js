import assert from 'node:assert';
import { describe, it } from 'node:test';
import { validateFinalizeOptions } from '../../src/commands/finalize.js';

describe('validateFinalizeOptions', () => {
  it('should validate parallel ID is provided', () => {
    let errors = validateFinalizeOptions('parallel-123', {});
    assert.deepStrictEqual(errors, []);

    errors = validateFinalizeOptions('', {});
    assert.deepStrictEqual(errors, ['Parallel ID is required']);

    errors = validateFinalizeOptions('   ', {});
    assert.deepStrictEqual(errors, ['Parallel ID is required']);

    errors = validateFinalizeOptions(null, {});
    assert.deepStrictEqual(errors, ['Parallel ID is required']);

    errors = validateFinalizeOptions(undefined, {});
    assert.deepStrictEqual(errors, ['Parallel ID is required']);
  });
});
