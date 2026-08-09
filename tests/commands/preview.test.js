import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePreviewOptions } from '../../src/commands/preview.js';

describe('validatePreviewOptions', () => {
  it('accepts a path to static files', () => {
    assert.deepStrictEqual(validatePreviewOptions('./dist', {}), []);
  });

  it('rejects missing and whitespace-only paths', () => {
    assert.deepStrictEqual(validatePreviewOptions(null, {}), [
      'Path to static files is required',
    ]);
    assert.deepStrictEqual(validatePreviewOptions('   ', {}), [
      'Path to static files is required',
    ]);
  });
});
