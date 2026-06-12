import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

describe('cli/tdd help', () => {
  it('shows the full nested command path for TDD subcommands', async () => {
    let result = await runCLI(['--no-color', 'tdd', 'start', '--help']);

    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /vizzly tdd start/);
    assert.doesNotMatch(result.stdout, /vizzly start\n/);
  });

  it('hides internal daemon child flag from user-facing help', async () => {
    let result = await runCLI(['--no-color', 'tdd', 'start', '--help']);

    assert.strictEqual(result.code, 0);
    assert.doesNotMatch(result.stdout, /daemon-child/);
  });

  it('documents port flags for lifecycle commands', async () => {
    let stop = await runCLI(['--no-color', 'tdd', 'stop', '--help']);
    let status = await runCLI(['--no-color', 'tdd', 'status', '--help']);

    assert.strictEqual(stop.code, 0);
    assert.strictEqual(status.code, 0);
    assert.match(stop.stdout, /--port <port>/);
    assert.match(status.stdout, /--port <port>/);
  });

  it('honors --no-color for TDD help output', async () => {
    let result = await runCLI(['--no-color', 'tdd', 'list']);
    let ansiMarker = `${String.fromCharCode(27)}[`;

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout.includes(ansiMarker), false);
    assert.strictEqual(result.stderr.includes(ansiMarker), false);
  });
});
