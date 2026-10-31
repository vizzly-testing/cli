import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { getPreviewInfo, uploadPreviewZip } from './preview.service.js';

describe('cloud previews', () => {
  it('uploads ZIP bytes as multipart file data and reads the resulting preview', async t => {
    let preview = { preview_url: 'https://preview.test', file_count: 47 };
    let { client, requests } = await createCloudServer(t, request => ({
      body: request.method === 'POST' ? { success: true, ...preview } : preview,
    }));
    let bytes = Buffer.from([0x50, 0x4b, 0, 0xff, 0x01]);
    assert.deepEqual(await uploadPreviewZip(client, 'build-1', bytes), {
      success: true,
      ...preview,
    });
    assert.deepEqual(await getPreviewInfo(client, 'build-1'), preview);
    assert.equal(requests[0].url, '/api/sdk/builds/build-1/preview/upload-zip');
    assert.equal(requests[0].method, 'POST');
    assert.match(
      requests[0].headers['content-type'],
      /^multipart\/form-data; boundary=/
    );
    assert.match(
      requests[0].bytes.toString(),
      /name="file"; filename="preview.zip"/
    );
    assert.match(
      requests[0].bytes.toString(),
      /Content-Type: application\/zip/
    );
    assert.ok(requests[0].bytes.includes(bytes));
    assert.equal(requests[1].url, '/api/sdk/builds/build-1/preview');
  });

  it('returns no preview for HTTP 404 and surfaces server failures', async t => {
    let { client } = await createCloudServer(t, request => ({
      status: request.url.includes('missing') ? 404 : 500,
      body: { error: 'Preview unavailable' },
    }));
    assert.equal(await getPreviewInfo(client, 'missing'), null);
    await assert.rejects(() => getPreviewInfo(client, 'broken'), {
      code: 'SERVER_ERROR',
      context: { status: 500, details: null },
    });
  });
});
