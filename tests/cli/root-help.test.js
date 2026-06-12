import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

describe('cli root help', () => {
  it('does not categorize the built-in project command as a plugin', async () => {
    let result = await runCLI(['--no-color', '--help']);

    assert.strictEqual(result.code, 0);
    assert.match(
      result.stdout,
      /Setup[\s\S]*project\s+Manage the project linked to this local checkout/
    );
    assert.doesNotMatch(
      result.stdout,
      /Plugins[\s\S]*project\s+Manage the project linked to this local checkout/
    );
  });
});
