import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseJSONOutput, runCLI } from '../helpers/cli-runner.js';

describe('commands/preview CLI', () => {
  it('keeps --json missing-path output machine-readable', async () => {
    let result = await runCLI(['--no-color', '--json', 'preview']);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdout, '');

    let messages = parseJSONOutput(result.stderr);
    assert.deepStrictEqual(messages, [
      {
        status: 'error',
        message: 'Path to static files is required',
      },
    ]);
    assert.doesNotMatch(result.stderr, /vizzly preview \.\/dist/);
  });

  it('reports a missing preview directory before auth errors', async () => {
    let result = await runCLI([
      '--no-color',
      'preview',
      './missing-preview-dir',
      '--build',
      'build-123',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /does not exist/);
    assert.doesNotMatch(result.stderr, /API token required/);
  });
});
