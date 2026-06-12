import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

describe('commands/upload CLI', () => {
  it('reports a missing screenshots path before auth errors', async () => {
    let result = await runCLI([
      '--no-color',
      'upload',
      './missing-screenshots-dir',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /does not exist/);
    assert.doesNotMatch(result.stderr, /API token required/);
  });
});
