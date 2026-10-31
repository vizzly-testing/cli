import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { getComparison, searchComparisons } from './cloud-comparisons.js';

describe('cloud comparisons', () => {
  it('reads comparison records and searches by name, scope, and pagination', async t => {
    let comparison = { id: 'comparison-1', status: 'different' };
    let results = { comparisons: [comparison], total: 1 };
    let { client, requests } = await createCloudServer(t, request => ({
      body: request.url.includes('/search') ? results : { comparison },
    }));
    assert.deepEqual(await getComparison(client, 'comparison-1'), comparison);
    assert.deepEqual(await searchComparisons(client, 'Header/Cart'), results);
    assert.deepEqual(
      await searchComparisons(client, 'Header/Cart', {
        branch: 'feature/cart',
        project: 'shop',
        organization: 'acme',
        limit: 10,
        offset: 20,
      }),
      results
    );
    assert.deepEqual(
      requests.map(({ url }) => url),
      [
        '/api/sdk/comparisons/comparison-1',
        '/api/sdk/comparisons/search?name=Header%2FCart&limit=50&offset=0',
        '/api/sdk/comparisons/search?name=Header%2FCart&limit=10&offset=20&branch=feature%2Fcart&project=shop&organization=acme',
      ]
    );
    for (let name of [null, '', 123]) {
      await assert.rejects(
        () => searchComparisons(client, name),
        /name is required/
      );
    }
    assert.equal(requests.length, 3);
  });
});
