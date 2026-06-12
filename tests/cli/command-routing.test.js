import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

function parseJsonLines(output) {
  return output
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

describe('cli command routing', () => {
  it('rejects unknown command help instead of showing root help as success', async () => {
    let result = await runCLI([
      '--no-color',
      'definitely-not-a-command',
      '--help',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /unknown command 'definitely-not-a-command'/);
    assert.doesNotMatch(result.stdout, /Quick Start/);
  });

  it('rejects unknown root commands in JSON mode without dumping help', async () => {
    let result = await runCLI([
      '--no-color',
      '--json',
      'definitely-not-a-command',
    ]);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdout, '');
    assert.doesNotMatch(result.stderr, /Quick Start/);

    let messages = parseJsonLines(result.stderr);
    assert.deepStrictEqual(messages, [
      {
        status: 'error',
        message: "unknown command 'definitely-not-a-command'",
      },
    ]);
  });

  it('rejects unknown root commands in JSON mode even when help is requested', async () => {
    let result = await runCLI([
      '--no-color',
      '--json',
      'definitely-not-a-command',
      '--help',
    ]);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdout, '');
    assert.doesNotMatch(result.stderr, /Quick Start/);

    let messages = parseJsonLines(result.stderr);
    assert.deepStrictEqual(messages, [
      {
        status: 'error',
        message: "unknown command 'definitely-not-a-command'",
      },
    ]);
  });

  it('gives nested unknown subcommands a recovery hint', async () => {
    let result = await runCLI([
      '--no-color',
      'tdd',
      'definitely-not-a-command',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /unknown command 'definitely-not-a-command'/);
    assert.match(result.stderr, /Run vizzly tdd --help/);
  });

  it('rejects nested unknown subcommands in JSON mode even when help is requested', async () => {
    let result = await runCLI([
      '--no-color',
      '--json',
      'tdd',
      'definitely-not-a-command',
      '--help',
    ]);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdout, '');
    assert.doesNotMatch(result.stderr, /vizzly tdd \[options\]/);

    let messages = parseJsonLines(result.stderr);
    assert.deepStrictEqual(messages, [
      {
        status: 'error',
        message: "unknown command 'definitely-not-a-command'",
      },
    ]);
  });

  it('points unknown context subcommands to context help', async () => {
    let result = await runCLI([
      '--no-color',
      'context',
      'definitely-not-a-command',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /unknown command 'definitely-not-a-command'/);
    assert.match(result.stderr, /Run vizzly context --help/);
  });

  it('points unknown project subcommands to project help', async () => {
    let result = await runCLI([
      '--no-color',
      'project',
      'definitely-not-a-command',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /unknown command 'definitely-not-a-command'/);
    assert.match(result.stderr, /Run vizzly project --help/);
  });
});
