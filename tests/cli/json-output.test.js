import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

function parseJsonLines(output) {
  return output
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

describe('cli json output', () => {
  it('wraps command payloads in the standard data envelope', async () => {
    let result = await runCLI(['--json', 'config', 'server.port']);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    let messages = parseJsonLines(result.stdout);
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

    let messages = parseJsonLines(result.stdout);
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

    let messages = parseJsonLines(result.stdout);
    assert.deepEqual(messages, [
      {
        status: 'data',
        data: {
          servers: [],
        },
      },
    ]);
  });

  it('emits JSON errors for missing required arguments', async () => {
    let result = await runCLI(['--json', 'status']);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');

    let messages = parseJsonLines(result.stderr);
    assert.deepEqual(messages, [
      {
        status: 'error',
        message: "missing required argument 'build-id'",
      },
    ]);
  });

  it('keeps validation errors machine-readable in JSON mode', async () => {
    let result = await runCLI(['--json', 'tdd', 'start', '--port', '99999']);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');

    let messages = parseJsonLines(result.stderr);
    assert.deepEqual(messages, [
      {
        status: 'error',
        message: 'Validation errors',
        errors: ['Port must be a valid number between 1 and 65535'],
      },
    ]);
  });
});
