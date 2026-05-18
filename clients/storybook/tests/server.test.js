import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { startStaticServer, stopStaticServer } from '../src/server.js';

describe('storybook static server', () => {
  let workspace;
  let serverInfo;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'vizzly-storybook-server-'));
    await mkdir(join(workspace, 'dist'));
    await writeFile(
      join(workspace, 'dist', 'index.html'),
      '<h1>Storybook</h1>'
    );
  });

  afterEach(async () => {
    await stopStaticServer(serverInfo);
    await rm(workspace, { recursive: true, force: true });
  });

  it('serves files and stops accepting requests after shutdown', async () => {
    serverInfo = await startStaticServer(join(workspace, 'dist'));

    let response = await fetch(`${serverInfo.url}/index.html`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Storybook/);

    await stopStaticServer(serverInfo);
    serverInfo = null;

    await assert.rejects(fetch(response.url));
  });
});
