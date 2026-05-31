import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

describe('cli plugin registration', () => {
  let workspace;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'vizzly-plugin-token-'));
    await writeFile(
      join(workspace, 'capture-plugin.js'),
      `import { writeFileSync } from 'node:fs';

export default {
  name: 'capture-plugin',
  version: '1.0.0',
  register(_program, { config }) {
    writeFileSync(
      process.env.VIZZLY_PLUGIN_CAPTURE_PATH,
      JSON.stringify({ apiKey: config.apiKey })
    );
  },
};
`
    );
    await writeFile(
      join(workspace, 'vizzly.config.js'),
      `export default {
  plugins: ['./capture-plugin.js'],
};
`
    );
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('passes --token to plugins registered before command parsing', async () => {
    let capturePath = join(workspace, 'capture.json');
    let result = await runCLI(['--token', 'cli-token', '--help'], {
      cwd: workspace,
      env: { VIZZLY_PLUGIN_CAPTURE_PATH: capturePath },
    });

    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(await readFile(capturePath, 'utf8')), {
      apiKey: 'cli-token',
    });
  });

  it('passes --token=value to plugins registered before command parsing', async () => {
    let capturePath = join(workspace, 'capture-equals.json');
    let result = await runCLI(['--token=equals-token', '--help'], {
      cwd: workspace,
      env: { VIZZLY_PLUGIN_CAPTURE_PATH: capturePath },
    });

    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(await readFile(capturePath, 'utf8')), {
      apiKey: 'equals-token',
    });
  });
});
