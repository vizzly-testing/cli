/**
 * Tests for API endpoints
 *
 * Tests endpoint functions with a mock client.
 * The mock client just records what was called - no network.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createBuild,
  getBuild,
  searchComparisons,
} from '../../src/api/endpoints.js';

/**
 * Create a mock client that records requests
 */
function createMockClient(response = {}) {
  let calls = [];

  return {
    request: async (endpoint, options = {}) => {
      calls.push({ endpoint, options });
      return response;
    },
    getCalls: () => calls,
    getLastCall: () => calls[calls.length - 1],
  };
}

describe('api/endpoints', () => {
  describe('getBuild', () => {
    it('requests correct endpoint', async () => {
      let client = createMockClient({ build: { id: '123' } });

      await getBuild(client, '123');

      assert.strictEqual(client.getLastCall().endpoint, '/api/sdk/builds/123');
    });

    it('includes include param when provided', async () => {
      let client = createMockClient({});

      await getBuild(client, '123', 'screenshots');

      assert.strictEqual(
        client.getLastCall().endpoint,
        '/api/sdk/builds/123?include=screenshots'
      );
    });
  });

  describe('createBuild', () => {
    it('sends POST with build payload', async () => {
      let client = createMockClient({ id: 'new-build' });

      await createBuild(client, {
        name: 'Test Build',
        branch: 'main',
        environment: 'test',
      });

      let call = client.getLastCall();
      assert.strictEqual(call.endpoint, '/api/sdk/builds');
      assert.strictEqual(call.options.method, 'POST');

      let body = JSON.parse(call.options.body);
      assert.strictEqual(body.build.name, 'Test Build');
      assert.strictEqual(body.build.branch, 'main');
    });
  });

  describe('searchComparisons', () => {
    it('throws VizzlyError if name is missing', async () => {
      let client = createMockClient({});

      await assert.rejects(
        () => searchComparisons(client, null),
        /name is required/
      );
    });

    it('builds endpoint with query params', async () => {
      let client = createMockClient({ comparisons: [] });

      await searchComparisons(client, 'homepage', {
        limit: 10,
        branch: 'main',
      });

      let call = client.getLastCall();
      assert.ok(call.endpoint.includes('/api/sdk/comparisons/search'));
      assert.ok(call.endpoint.includes('name=homepage'));
      assert.ok(call.endpoint.includes('limit=10'));
      assert.ok(call.endpoint.includes('branch=main'));
    });
  });
});
