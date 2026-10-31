import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createServices, loadConfig } from '../../src/index.js';

test('programmatic services preserve explicit comparison while loaded defaults inherit project settings', async t => {
  let cwd = await mkdtemp(path.join(tmpdir(), 'vizzly-public-services-'));
  let previousCwd = process.cwd();
  let previousEnv = { ...process.env };
  let builds = [];
  let server = createServer(async (request, response) => {
    let chunks = [];
    for await (let chunk of request) chunks.push(chunk);
    builds.push(JSON.parse(Buffer.concat(chunks)).build);
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        id: 'fixture-build',
        url: 'http://fixture.test/builds/fixture-build',
      })
    );
  });
  t.after(async () => {
    process.chdir(previousCwd);
    for (let name of Object.keys(process.env)) {
      if (name.startsWith('VIZZLY_')) delete process.env[name];
    }
    for (let [name, value] of Object.entries(previousEnv)) {
      if (name.startsWith('VIZZLY_')) process.env[name] = value;
    }
    await new Promise(resolve => server.close(resolve));
    await rm(cwd, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  process.chdir(cwd);
  for (let name of Object.keys(process.env)) {
    if (name.startsWith('VIZZLY_')) delete process.env[name];
  }
  process.env.VIZZLY_HOME = path.join(cwd, 'user-state');
  process.env.VIZZLY_DISABLE_KEYCHAIN = 'true';
  let values = {
    apiUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: 'fixture-token',
  };
  await createServices({
    ...values,
    comparison: { threshold: 0 },
  }).testRunner.createBuild({ buildName: 'Direct config' }, false);
  assert.deepEqual(builds[0].metadata.comparison, { threshold: 0 });

  await writeFile('.vizzlyrc.json', JSON.stringify(values));
  let loaded = await loadConfig();
  assert.equal(loaded.comparison.threshold, 2);
  await createServices(loaded).testRunner.createBuild(
    { buildName: 'Loaded config' },
    false
  );
  assert.equal(builds[1].metadata, undefined);
});
