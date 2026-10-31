import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { checkShas, uploadScreenshot } from './cloud-screenshots.js';

describe('cloud screenshot delivery', () => {
  it('checks screenshot signatures and keeps every image uploadable when the check fails', async t => {
    let checked = {
      existing: ['sha1'],
      missing: ['sha2'],
      screenshots: [{ id: 'capture-1', sha256: 'sha1' }],
    };
    let { client, requests } = await createCloudServer(t, (_, received) => ({
      status: received.length === 1 ? 200 : 503,
      body: received.length === 1 ? checked : { error: 'Unavailable' },
    }));
    let screenshots = [
      { sha256: 'sha1', name: 'Checkout' },
      { sha256: 'sha2' },
    ];
    assert.deepEqual(await checkShas(client, screenshots, 'build-1'), checked);
    assert.equal(requests[0].url, '/api/sdk/check-shas');
    assert.equal(requests[0].method, 'POST');
    assert.deepEqual(requests[0].body, { buildId: 'build-1', screenshots });
    for (let input of [screenshots, ['sha1', 'sha2']]) {
      assert.deepEqual(await checkShas(client, input, 'build-1'), {
        existing: [],
        missing: ['sha1', 'sha2'],
        screenshots: [],
      });
    }
    assert.deepEqual(requests[2].body, {
      buildId: 'build-1',
      shas: ['sha1', 'sha2'],
    });
  });

  it('resolves the image hash, then uploads exact bytes and capture metadata', async t => {
    let { client, requests } = await createCloudServer(t, request => ({
      body: request.body.image_data
        ? { id: 'capture-1' }
        : { upload_required: true },
    }));
    let bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0xff]);
    let properties = {
      browser: 'firefox',
      viewport: { width: 1280, height: 720 },
    };
    let options = { threshold: 0, minClusterSize: 4, fullPage: true };
    let sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual(
      await uploadScreenshot(
        client,
        'build-1',
        'Checkout',
        bytes,
        properties,
        false,
        options
      ),
      { id: 'capture-1' }
    );
    assert.equal(requests.length, 2);
    for (let request of requests) {
      assert.equal(request.url, '/api/sdk/builds/build-1/screenshots');
      assert.equal(request.method, 'POST');
      assert.deepEqual(request.body.properties, properties);
      assert.equal(request.body.sha256, sha256);
      assert.equal(request.body.name, 'Checkout');
      assert.equal(request.body.threshold, 0);
      assert.equal(request.body.minClusterSize, 4);
      assert.equal(request.body.fullPage, true);
    }
    assert.equal(requests[0].body.image_data, undefined);
    assert.deepEqual(Buffer.from(requests[1].body.image_data, 'base64'), bytes);
  });

  it('reuses existing image bytes without sending the image again', async t => {
    let screenshot = { id: 'existing-1', upload_required: false };
    let { client, requests } = await createCloudServer(t, () => ({
      body: screenshot,
    }));
    let result = await uploadScreenshot(
      client,
      'build-1',
      'Checkout',
      Buffer.from('pixels')
    );
    assert.equal(result.skipped, true);
    assert.equal(result.fromExisting, true);
    assert.deepEqual(result.screenshot, screenshot);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.image_data, undefined);
  });

  it('falls back from a byte-only API HTTP 400 without changing names or options', async t => {
    let { client, requests } = await createCloudServer(t, request => ({
      status: request.body.image_data ? 201 : 400,
      body: request.body.image_data
        ? { id: 'capture-1', name: request.body.name }
        : { error: 'name and image_data are required' },
    }));
    for (let name of ['Checkout', 'Checkout.png']) {
      let result = await uploadScreenshot(
        client,
        'build-1',
        name,
        Buffer.from('same pixels'),
        { browser: 'firefox', theme: 'dark' },
        false,
        { threshold: 7, minClusterSize: 3 }
      );
      assert.equal(result.name, name);
    }
    assert.equal(requests.length, 4);
    let captures = requests.filter(({ body }) => body.image_data);
    assert.deepEqual(
      captures.map(({ body }) => body.name),
      ['Checkout', 'Checkout.png']
    );
    for (let { body } of requests) {
      assert.deepEqual(body.properties, { browser: 'firefox', theme: 'dark' });
      assert.equal(body.threshold, 7);
      assert.equal(body.minClusterSize, 3);
    }
  });

  it('uploads bytes when the SHA service is unavailable', async t => {
    let { client, requests } = await createCloudServer(t, request => ({
      status: request.body.image_data ? 201 : 503,
      body: request.body.image_data
        ? { id: 'capture-1' }
        : { error: 'Unavailable' },
    }));
    assert.deepEqual(
      await uploadScreenshot(
        client,
        'build-1',
        'Checkout',
        Buffer.from('pixels')
      ),
      { id: 'capture-1' }
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.image_data, undefined);
    assert.equal(
      Buffer.from(requests[1].body.image_data, 'base64').toString(),
      'pixels'
    );
  });

  it('surfaces authorization and ownership failures without sending image bytes', async t => {
    let { client, requests } = await createCloudServer(t, request => ({
      status: request.url.includes('unauthorized') ? 401 : 403,
      body: { error: 'Access denied' },
    }));
    for (let [buildId, code] of [
      ['unauthorized', 'AUTH_ERROR'],
      ['forbidden', 'FORBIDDEN'],
    ]) {
      await assert.rejects(
        () =>
          uploadScreenshot(client, buildId, 'Checkout', Buffer.from('pixels')),
        { code }
      );
    }
    assert.equal(requests.length, 2);
    assert.ok(requests.every(({ body }) => body.image_data === undefined));
  });

  it('sends image bytes immediately when all images were requested', async t => {
    let { client, requests } = await createCloudServer(t, () => ({
      body: { id: 'capture-1' },
    }));
    assert.deepEqual(
      await uploadScreenshot(
        client,
        'build-1',
        'Checkout',
        Buffer.from('pixels'),
        {},
        true
      ),
      { id: 'capture-1' }
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/sdk/builds/build-1/screenshots');
    assert.equal(
      Buffer.from(requests[0].body.image_data, 'base64').toString(),
      'pixels'
    );
    assert.equal(requests[0].body.sha256, undefined);
  });
});
