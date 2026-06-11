import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

describe('commands/review CLI help', () => {
  it('does not overstate review identifier formats', async () => {
    let approve = await runCLI(['--no-color', 'approve', '--help']);
    let reject = await runCLI(['--no-color', 'reject', '--help']);
    let comment = await runCLI(['--no-color', 'comment', '--help']);

    assert.strictEqual(approve.code, 0);
    assert.strictEqual(reject.code, 0);
    assert.strictEqual(comment.code, 0);

    assert.doesNotMatch(approve.stdout, /UUID format/);
    assert.doesNotMatch(reject.stdout, /UUID format/);
    assert.doesNotMatch(comment.stdout, /UUID format/);
  });
});
