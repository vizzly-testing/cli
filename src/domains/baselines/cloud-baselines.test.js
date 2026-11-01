import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { getTddBaselines } from './cloud-baselines.js';

it('reads cloud TDD baseline records and their signature properties', async t => {
  let baselines = {
    build: { id: 'build-1', branch: 'main' },
    screenshots: [{ name: 'Checkout', sha256: 'abc', url: '/image.png' }],
    signatureProperties: ['browser'],
  };
  let { client, requests } = await createCloudServer(t, () => ({
    body: baselines,
  }));
  assert.deepEqual(await getTddBaselines(client, 'build-1'), baselines);
  assert.equal(requests[0].url, '/api/sdk/builds/build-1/tdd-baselines');
  assert.equal(requests[0].method, 'GET');
});
