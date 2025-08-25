import { describe, it, expect } from 'vitest';
import { validateFinalizeOptions } from '../../src/commands/finalize.js';

describe('validateFinalizeOptions', () => {
  it('should validate parallel ID is provided', () => {
    let errors = validateFinalizeOptions('parallel-123', {});
    expect(errors).toEqual([]);

    errors = validateFinalizeOptions('', {});
    expect(errors).toEqual(['Parallel ID is required']);

    errors = validateFinalizeOptions('   ', {});
    expect(errors).toEqual(['Parallel ID is required']);

    errors = validateFinalizeOptions(null, {});
    expect(errors).toEqual(['Parallel ID is required']);

    errors = validateFinalizeOptions(undefined, {});
    expect(errors).toEqual(['Parallel ID is required']);
  });
});
