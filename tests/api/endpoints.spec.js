/**
 * Tests for API endpoints
 *
 * Tests endpoint functions with a mock client.
 * The mock client just records what was called - no network.
 */

import { describe, expect, it } from 'vitest';
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

      expect(client.getLastCall().endpoint).toBe('/api/sdk/builds/123');
    });

    it('includes include param when provided', async () => {
      let client = createMockClient({});

      await getBuild(client, '123', 'screenshots');

      expect(client.getLastCall().endpoint).toBe(
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
      expect(call.endpoint).toBe('/api/sdk/builds');
      expect(call.options.method).toBe('POST');

      let body = JSON.parse(call.options.body);
      expect(body.build.name).toBe('Test Build');
      expect(body.build.branch).toBe('main');
    });
  });

  describe('searchComparisons', () => {
    it('throws VizzlyError if name is missing', async () => {
      let client = createMockClient({});

      await expect(searchComparisons(client, null)).rejects.toThrow(
        'name is required'
      );
    });

    it('builds endpoint with query params', async () => {
      let client = createMockClient({ comparisons: [] });

      await searchComparisons(client, 'homepage', {
        limit: 10,
        branch: 'main',
      });

      let call = client.getLastCall();
      expect(call.endpoint).toContain('/api/sdk/comparisons/search');
      expect(call.endpoint).toContain('name=homepage');
      expect(call.endpoint).toContain('limit=10');
      expect(call.endpoint).toContain('branch=main');
    });
  });
});
