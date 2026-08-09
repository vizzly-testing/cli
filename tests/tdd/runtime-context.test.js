import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveTddWorkingDirectory } from '../../src/tdd/runtime-context.js';

describe('tdd/runtime-context', () => {
  it('returns validated working directory when path is valid', () => {
    let output = { error: () => {} };
    let validated = resolveTddWorkingDirectory(
      '/tmp/work',
      path => path,
      output
    );

    assert.strictEqual(validated, '/tmp/work');
  });

  it('logs and throws when working directory validation fails', () => {
    let logged = null;
    let output = { error: message => (logged = message) };

    assert.throws(
      () =>
        resolveTddWorkingDirectory(
          '/tmp/work',
          () => {
            throw new Error('bad path');
          },
          output
        ),
      /Working directory validation failed: bad path/
    );
    assert.strictEqual(logged, 'Invalid working directory: bad path');
  });
});
