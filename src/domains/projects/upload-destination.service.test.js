import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { getTokenContext } from './upload-destination.service.js';

describe('token destination', () => {
  it('reads the organization and project a token belongs to', async t => {
    let tokenContext = {
      organization: { slug: 'acme' },
      project: { slug: 'storybook' },
    };
    let { client, requests } = await createCloudServer(t, () => ({
      body: tokenContext,
    }));

    assert.deepEqual(await getTokenContext(client), tokenContext);
    assert.equal(requests.at(-1).method, 'GET');
    assert.equal(requests.at(-1).url, '/api/sdk/token/context');
  });
});
