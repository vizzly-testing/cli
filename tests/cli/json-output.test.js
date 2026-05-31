import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseJSONOutput, runCLI } from '../helpers/cli-runner.js';

describe('cli json output', () => {
  it('wraps command payloads in the standard data envelope', async () => {
    let result = await runCLI(['--json', 'config', 'server.port']);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    let messages = parseJSONOutput(result.stdout);
    assert.deepEqual(messages, [
      {
        status: 'data',
        data: {
          key: 'server.port',
          value: 47392,
        },
      },
    ]);
  });

  it('selects json fields from the command payload before wrapping', async () => {
    let result = await runCLI(['--json', 'key', 'config', 'server.port']);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    let messages = parseJSONOutput(result.stdout);
    assert.deepEqual(messages, [
      {
        status: 'data',
        data: {
          key: 'server.port',
        },
      },
    ]);
  });

  it('uses the same envelope for TDD subcommands with empty payloads', async () => {
    let result = await runCLI(['--json', 'tdd', 'list']);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    let messages = parseJSONOutput(result.stdout);
    assert.deepEqual(messages, [
      {
        status: 'data',
        data: {
          servers: [],
        },
      },
    ]);
  });
});
