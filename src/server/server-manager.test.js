import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import * as fs from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createApiHandler } from '../domains/screenshots/cloud-handler.js';
import { stopServer, writeServerJson } from './server-lifecycle.js';
import { createServerManager } from './server-manager.js';

let image = await readFile(
  new URL(
    '../../tests/reporter/fixtures/images/screenshots/pricing-page.png',
    import.meta.url
  )
);

async function workspace(t) {
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-manager-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function listen(server) {
  let listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  return server.address().port;
}

async function availablePort() {
  let server = createServer();
  let port = await listen(server);
  await promisify(server.close.bind(server))();
  return port;
}

async function capture(url, name = 'homepage') {
  let response = await fetch(`${url}/screenshot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      image: image.toString('base64'),
      type: 'base64',
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('local capture persists a baseline, reports its comparison, and removes discovery on shutdown', async t => {
  let directory = await workspace(t);
  let port = await availablePort();
  let manager = createServerManager(
    { server: { port } },
    {},
    { projectRoot: directory }
  );
  t.after(() => manager.stop());
  await manager.start('local-build', true, true);
  let url = `http://127.0.0.1:${port}`;
  let discoveryPath = join(directory, '.vizzly/server.json');
  let discovery = JSON.parse(await readFile(discoveryPath, 'utf8'));
  assert.equal(discovery.port, String(port));
  assert.equal(discovery.buildId, 'local-build');
  assert.equal((await fetch(`${url}/health`)).status, 200);

  await capture(url);
  let result = await manager.getTddResults();
  assert.equal(result.total, 1);
  assert.equal(result.comparisons[0].name, 'homepage');
  let metadata = JSON.parse(
    await readFile(join(directory, '.vizzly/baselines/metadata.json'), 'utf8')
  );
  assert.equal(metadata.screenshots[0].name, 'homepage');
  assert.deepEqual(await readFile(metadata.screenshots[0].path), image);
  assert.notEqual(directory, process.cwd());
  let health = await (await fetch(`${url}/health`)).json();
  assert.deepEqual(health.stats, { total: 1, passed: 1, failed: 0, errors: 0 });
  assert.deepEqual(health.baseline, {
    buildName: metadata.buildName,
    createdAt: metadata.createdAt,
  });

  await manager.stop();
  assert.equal(fs.existsSync(discoveryPath), false);
  assert.equal(await manager.getTddResults(), null);
  await assert.rejects(fetch(`${url}/health`));
});

test('cloud capture flushes real API requests before shutdown and can restart with fresh capture counts', async t => {
  let directory = await workspace(t);
  let requests = [];
  let cloud = createServer(async (request, response) => {
    let chunks = [];
    for await (let chunk of request) chunks.push(chunk);
    requests.push({
      path: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ upload_required: false }));
  });
  let cloudPort = await listen(cloud);
  t.after(() => promisify(cloud.close.bind(cloud))());
  let port = await availablePort();
  let manager = createServerManager(
    {
      server: { port },
      apiKey: 'vzt_test',
      apiUrl: `http://127.0.0.1:${cloudPort}`,
    },
    {},
    { projectRoot: directory }
  );
  t.after(() => manager.stop());
  await manager.start('cloud-build', false, false);
  let url = `http://127.0.0.1:${port}`;
  await capture(url);
  let stats = await manager.server.finishBuild('cloud-build');
  assert.deepEqual(
    { total: stats.total, reused: stats.reused, failed: stats.failed },
    { total: 1, reused: 1, failed: 0 }
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/api/sdk/builds/cloud-build/screenshots');
  assert.equal(requests[0].body.name, 'homepage');
  assert.equal(
    requests[0].body.sha256,
    createHash('sha256').update(image).digest('hex')
  );
  assert.equal(manager.server.getScreenshotCount('cloud-build'), 1);
  await manager.stop();
  assert.equal(fs.existsSync(join(directory, '.vizzly/server.json')), false);
  await assert.rejects(fetch(`${url}/health`));
  await manager.start('next-build', false, false);
  assert.equal(manager.server.getScreenshotCount('next-build'), 0);
  await manager.stop();
});

test('shutdown preserves the native close error while clearing captures and discovery', async t => {
  let directory = await workspace(t);
  let nativeServer = createServer();
  let handler = createApiHandler(null);
  await handler.handleScreenshot(
    'build',
    'homepage',
    image.toString('base64'),
    {},
    'base64'
  );
  assert.equal(handler.getScreenshotCount(), 1);
  writeServerJson({ projectRoot: directory, port: 1234, fs });
  await assert.rejects(
    stopServer({
      httpServer: { stop: promisify(nativeServer.close.bind(nativeServer)) },
      handler,
      projectRoot: directory,
      deps: { fs },
    }),
    { code: 'ERR_SERVER_NOT_RUNNING' }
  );
  assert.equal(handler.getScreenshotCount(), 0);
  assert.equal(fs.existsSync(join(directory, '.vizzly/server.json')), false);
});
