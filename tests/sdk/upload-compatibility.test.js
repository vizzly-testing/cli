import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApiClient } from '../../src/api/client.js';
import { uploadScreenshot } from '../../src/api/endpoints.js';
import { createUploader } from '../../src/sdk/index.js';

async function apiServer(t, respond) {
  let requests = [];
  let server = createServer(async (request, response) => {
    let chunks = [];
    for await (let chunk of request) chunks.push(chunk);
    let body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url, body });
    let result = respond(request.url, body);
    response.writeHead(result.status || 200, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify(result.body));
  });
  let ready = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await ready;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
  });
  let apiUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    apiUrl,
    requests,
    client: createApiClient({
      baseUrl: apiUrl,
      token: 'vzt_compatibility',
      command: 'run',
    }),
  };
}

test('SHA-first SDK falls back safely to the released byte-only API without changing names or options', async t => {
  let captures = [];
  let { client, requests } = await apiServer(t, (_path, body) => {
    if (!body.image_data)
      return {
        status: 400,
        body: { error: 'name and image_data are required' },
      };
    captures.push(body);
    return {
      status: 201,
      body: { id: `capture-${captures.length}`, name: body.name },
    };
  });
  for (let name of ['Checkout', 'Checkout.png']) {
    let uploaded = await uploadScreenshot(
      client,
      'build-1',
      name,
      Buffer.from('same pixels'),
      { browser: 'firefox', theme: 'dark' },
      false,
      { threshold: 7, minClusterSize: 3 }
    );
    assert.equal(uploaded.name, name);
  }
  assert.equal(requests.length, 4);
  assert.deepEqual(
    captures.map(({ name }) => name),
    ['Checkout', 'Checkout.png']
  );
  assert.ok(
    captures.every(
      ({ properties }) =>
        properties.browser === 'firefox' && properties.theme === 'dark'
    )
  );
  assert.ok(
    captures.every(
      ({ threshold, minClusterSize }) => threshold === 7 && minClusterSize === 3
    )
  );
});

test('SDK reuses one image for separate literal capture names against the SHA-capable API', async t => {
  let stored = new Set();
  let captures = new Map();
  let writes = 0;
  let { client, requests } = await apiServer(t, (_path, body) => {
    if (!body.image_data && !stored.has(body.sha256)) {
      return {
        body: { name: body.name, sha256: body.sha256, upload_required: true },
      };
    }
    if (body.image_data) {
      stored.add(body.sha256);
      writes++;
    }
    if (!captures.has(body.name))
      captures.set(body.name, `capture-${captures.size + 1}`);
    return {
      status: 201,
      body: {
        id: captures.get(body.name),
        name: body.name,
        sha256: body.sha256,
        upload_required: false,
      },
    };
  });
  let bytes = Buffer.from('same pixels');
  let first = await uploadScreenshot(client, 'build-1', 'Checkout', bytes, {
    browser: 'chrome',
  });
  let second = await uploadScreenshot(
    client,
    'build-1',
    'Checkout.png',
    bytes,
    { browser: 'chrome' }
  );
  assert.equal(first.name, 'Checkout');
  assert.equal(second.screenshot.name, 'Checkout.png');
  assert.equal(second.skipped, true);
  assert.notEqual(first.id, second.screenshot.id);
  assert.equal(writes, 1);
  assert.equal(requests.length, 3);
});

test('the SDK file uploader remains compatible with an API that ignores the additive filename field', async t => {
  let directory = await mkdtemp(
    join(tmpdir(), 'vizzly-sdk-file-compatibility-')
  );
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  let bytes = Buffer.from('same file bytes');
  let sha256 = createHash('sha256').update(bytes).digest('hex');
  let names = ['Homepage-chrome.png', 'Panel.png.png'];
  for (let name of names) await writeFile(join(directory, name), bytes);
  let { apiUrl, requests } = await apiServer(t, (path, body) => {
    if (path === '/api/sdk/builds')
      return { status: 201, body: { id: 'build-1' } };
    if (path === '/api/sdk/check-shas') {
      // The released contract reads name/properties and ignores unknown per-capture fields.
      assert.deepEqual(body.screenshots.map(({ name }) => name).sort(), [
        'Homepage-chrome',
        'Panel.png',
      ]);
      return {
        body: {
          existing: [sha256],
          missing: [],
          screenshots: names.map((name, index) => ({
            id: `capture-${index}`,
            name,
            sha256,
          })),
        },
      };
    }
    return {
      status: 500,
      body: { error: 'No multipart upload should be needed' },
    };
  });
  let uploader = createUploader({ apiKey: 'vzt_compatibility', apiUrl });
  let result = await uploader.upload({
    screenshotsDir: directory,
    buildName: 'SDK compatibility',
    branch: 'main',
  });
  assert.equal(result.success, true);
  assert.equal(result.stats.uploaded, 0);
  assert.equal(result.stats.skipped, 2);
  assert.deepEqual(
    requests.map(({ path }) => path),
    ['/api/sdk/builds', '/api/sdk/check-shas']
  );
  assert.deepEqual(
    requests[1].body.screenshots.map(({ filename }) => filename).sort(),
    [...names].sort()
  );
});
