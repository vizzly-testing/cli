import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'vizzly-cli-config-'));
}

function parseSingleJson(stdout) {
  let parsed = JSON.parse(stdout);
  assert.strictEqual(typeof parsed, 'object');
  return parsed;
}

describe('commands/config CLI', () => {
  it('reports the loaded config file when a config file is applied', async () => {
    let cwd = createWorkspace();
    let configPath = join(cwd, '.vizzlyrc.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          server: { port: 9999 },
          comparison: { threshold: 7 },
        },
        null,
        2
      )
    );

    let result = await runCLI(['--no-color', '--json', 'config'], { cwd });

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stderr, '');

    let payload = parseSingleJson(result.stdout);
    assert.strictEqual(payload.data.configFile, realpathSync(configPath));
    assert.strictEqual(payload.data.config.server.port, 9999);
    assert.strictEqual(payload.data.config.comparison.threshold, 7);
  });
});
