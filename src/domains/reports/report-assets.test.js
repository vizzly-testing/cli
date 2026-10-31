import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHttpServer } from '../../adapters/http/http-server.js';
import { getPackageRoot } from '../../shared/package-info.js';

async function serveWorkspace(t) {
  let workingDir = await mkdtemp(join(tmpdir(), 'vizzly-report-assets-'));
  let app = createHttpServer(0, null, { workingDir });
  t.after(async () => {
    await app.stop();
    await rm(workingDir, { recursive: true, force: true });
  });
  await app.start();
  let url = `http://127.0.0.1:${app.getServer().address().port}`;
  return { workingDir, url };
}

test('report images come from the served workspace with caching disabled', async t => {
  let { workingDir, url } = await serveWorkspace(t);
  let image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
    'base64'
  );
  let directory = join(workingDir, '.vizzly', 'current');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'capture.png'), image);

  let response = await fetch(`${url}/images/current/capture.png`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(
    response.headers.get('cache-control'),
    'no-store, no-cache, must-revalidate'
  );
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('expires'), '0');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);

  let missing = await fetch(`${url}/images/current/missing.png`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'Image not found');

  let unsupported = await fetch(`${url}/images/current/capture.png`, {
    method: 'POST',
  });
  assert.equal(unsupported.status, 404);
});

let reporterDirectory = join(getPackageRoot(), 'dist', 'reporter');
test('reporter scripts and styles are served from the packaged build', async t => {
  let { url } = await serveWorkspace(t);
  for (let [route, filename, contentType] of [
    [
      '/reporter-bundle.js',
      'reporter-bundle.iife.js',
      'application/javascript',
    ],
    ['/reporter-bundle.css', 'reporter-bundle.css', 'text/css'],
  ]) {
    let response = await fetch(`${url}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('content-type'), contentType);
    assert.equal(
      await response.text(),
      await readFile(join(reporterDirectory, filename), 'utf8')
    );
  }
});
