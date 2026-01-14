/**
 * Tests for API endpoints
 *
 * Tests endpoint functions with a mock client.
 * The mock client just records what was called - no network.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  checkShas,
  createBuild,
  finalizeBuild,
  finalizeParallelBuild,
  getBatchHotspots,
  getBuild,
  getBuilds,
  getComparison,
  getPreviewInfo,
  getScreenshotHotspots,
  getTddBaselines,
  getTokenContext,
  searchComparisons,
  updateBuildStatus,
  uploadPreviewZip,
  uploadScreenshot,
} from '../../src/api/endpoints.js';

/**
 * Create a mock client that records requests
 */
function createMockClient(responseOrHandler = {}) {
  let calls = [];

  return {
    request: async (endpoint, options = {}) => {
      calls.push({ endpoint, options });

      // Support function handler for dynamic responses
      if (typeof responseOrHandler === 'function') {
        return responseOrHandler(endpoint, options);
      }

      // Support endpoint-specific responses
      if (
        responseOrHandler[endpoint] !== undefined &&
        typeof responseOrHandler !== 'function'
      ) {
        let response = responseOrHandler[endpoint];
        if (response instanceof Error) {
          throw response;
        }
        return response;
      }

      return responseOrHandler;
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

  describe('getBuilds', () => {
    it('fetches builds with no filters', async () => {
      let client = createMockClient([{ id: '1' }, { id: '2' }]);

      let result = await getBuilds(client);

      assert.strictEqual(client.getLastCall().endpoint, '/api/sdk/builds');
      assert.deepStrictEqual(result, [{ id: '1' }, { id: '2' }]);
    });

    it('applies filters as query params', async () => {
      let client = createMockClient([]);

      await getBuilds(client, { branch: 'main', status: 'completed' });

      let endpoint = client.getLastCall().endpoint;
      assert.ok(endpoint.includes('branch=main'));
      assert.ok(endpoint.includes('status=completed'));
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

  describe('updateBuildStatus', () => {
    it('updates build status', async () => {
      let client = createMockClient({ status: 'completed' });

      await updateBuildStatus(client, 'build-123', 'completed');

      let call = client.getLastCall();
      assert.strictEqual(call.endpoint, '/api/sdk/builds/build-123/status');
      assert.strictEqual(call.options.method, 'PUT');

      let body = JSON.parse(call.options.body);
      assert.strictEqual(body.status, 'completed');
    });

    it('includes execution time when provided', async () => {
      let client = createMockClient({});

      await updateBuildStatus(client, 'build-123', 'completed', 5000);

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.executionTimeMs, 5000);
    });

    it('omits execution time when null', async () => {
      let client = createMockClient({});

      await updateBuildStatus(client, 'build-123', 'completed', null);

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.executionTimeMs, undefined);
    });
  });

  describe('finalizeBuild', () => {
    it('finalizes build as completed when success is true', async () => {
      let client = createMockClient({});

      await finalizeBuild(client, 'build-123', true);

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.status, 'completed');
    });

    it('finalizes build as failed when success is false', async () => {
      let client = createMockClient({});

      await finalizeBuild(client, 'build-123', false);

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.status, 'failed');
    });

    it('defaults success to true', async () => {
      let client = createMockClient({});

      await finalizeBuild(client, 'build-123');

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.status, 'completed');
    });

    it('passes execution time', async () => {
      let client = createMockClient({});

      await finalizeBuild(client, 'build-123', true, 3000);

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.executionTimeMs, 3000);
    });
  });

  describe('getTddBaselines', () => {
    it('fetches TDD baselines for build', async () => {
      let client = createMockClient({
        build: {},
        screenshots: [],
      });

      let result = await getTddBaselines(client, 'build-123');

      assert.strictEqual(
        client.getLastCall().endpoint,
        '/api/sdk/builds/build-123/tdd-baselines'
      );
      assert.ok(result.build !== undefined);
    });
  });

  describe('checkShas', () => {
    it('checks SHAs with build ID', async () => {
      let client = createMockClient({
        '/api/sdk/check-shas': {
          existing: ['sha1'],
          missing: ['sha2'],
          screenshots: [],
        },
      });

      let result = await checkShas(
        client,
        [{ sha256: 'sha1' }, { sha256: 'sha2' }],
        'build-123'
      );

      assert.deepStrictEqual(result.existing, ['sha1']);
      assert.deepStrictEqual(result.missing, ['sha2']);
    });

    it('returns fallback on error with object screenshots', async () => {
      let client = createMockClient({
        '/api/sdk/check-shas': new Error('API error'),
      });

      let result = await checkShas(
        client,
        [{ sha256: 'sha1' }, { sha256: 'sha2' }],
        'build-123'
      );

      assert.deepStrictEqual(result.existing, []);
      assert.deepStrictEqual(result.missing, ['sha1', 'sha2']);
    });

    it('returns fallback on error with string SHAs', async () => {
      let client = createMockClient({
        '/api/sdk/check-shas': new Error('API error'),
      });

      let result = await checkShas(client, ['sha1', 'sha2'], 'build-123');

      assert.deepStrictEqual(result.existing, []);
      assert.deepStrictEqual(result.missing, ['sha1', 'sha2']);
    });
  });

  describe('uploadScreenshot', () => {
    it('uploads screenshot with deduplication', async () => {
      let client = createMockClient(endpoint => {
        if (endpoint === '/api/sdk/check-shas') {
          return { existing: [], missing: ['someSha'], screenshots: [] };
        }
        return { id: 'screenshot-1' };
      });

      let buffer = Buffer.from('fake png data');
      let result = await uploadScreenshot(
        client,
        'build-123',
        'test-screenshot',
        buffer,
        { viewport: '1920x1080' }
      );

      assert.ok(result);
      // Should have called check-shas first, then upload
      let calls = client.getCalls();
      assert.strictEqual(calls.length, 2);
    });

    it('skips upload when SHA exists', async () => {
      let buffer = Buffer.from('fake png data');
      // Compute the actual SHA that will be generated
      let crypto = await import('node:crypto');
      let sha = crypto.createHash('sha256').update(buffer).digest('hex');

      let client = createMockClient(endpoint => {
        if (endpoint === '/api/sdk/check-shas') {
          return {
            existing: [sha],
            missing: [],
            screenshots: [{ sha256: sha, id: 'existing-id' }],
          };
        }
        return { id: 'screenshot-1' };
      });

      let result = await uploadScreenshot(
        client,
        'build-123',
        'test-screenshot',
        buffer
      );

      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.fromExisting, true);
      // Should only call check-shas, not upload
      let calls = client.getCalls();
      assert.strictEqual(calls.length, 1);
    });

    it('uploads directly when skipDedup is true', async () => {
      let client = createMockClient({ id: 'screenshot-1' });

      let buffer = Buffer.from('fake png data');
      await uploadScreenshot(
        client,
        'build-123',
        'test-screenshot',
        buffer,
        {},
        true // skipDedup
      );

      let calls = client.getCalls();
      // Should only have one call (upload), not checkShas
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].endpoint.includes('/screenshots'));
    });
  });

  describe('getComparison', () => {
    it('fetches comparison and returns comparison field', async () => {
      let client = createMockClient({
        comparison: { id: 'comp-123', status: 'different' },
      });

      let result = await getComparison(client, 'comp-123');

      assert.strictEqual(result.id, 'comp-123');
      assert.strictEqual(result.status, 'different');
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

    it('throws for empty string name', async () => {
      let client = createMockClient({});

      await assert.rejects(
        () => searchComparisons(client, ''),
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

    it('uses default limit and offset', async () => {
      let client = createMockClient({});

      await searchComparisons(client, 'homepage');

      let endpoint = client.getLastCall().endpoint;
      assert.ok(endpoint.includes('limit=50'));
      assert.ok(endpoint.includes('offset=0'));
    });
  });

  describe('getScreenshotHotspots', () => {
    it('fetches hotspots for screenshot', async () => {
      let client = createMockClient({ hotspots: [] });

      await getScreenshotHotspots(client, 'my-screenshot');

      let endpoint = client.getLastCall().endpoint;
      assert.ok(endpoint.includes('/api/sdk/screenshots/'));
      assert.ok(endpoint.includes('/hotspots'));
    });

    it('includes window size option', async () => {
      let client = createMockClient({});

      await getScreenshotHotspots(client, 'my-screenshot', { windowSize: 30 });

      let endpoint = client.getLastCall().endpoint;
      assert.ok(endpoint.includes('windowSize=30'));
    });

    it('uses default window size', async () => {
      let client = createMockClient({});

      await getScreenshotHotspots(client, 'my-screenshot');

      let endpoint = client.getLastCall().endpoint;
      assert.ok(endpoint.includes('windowSize=20'));
    });

    it('encodes screenshot name', async () => {
      let client = createMockClient({});

      await getScreenshotHotspots(client, 'screenshot with spaces');

      let endpoint = client.getLastCall().endpoint;
      assert.ok(endpoint.includes('screenshot%20with%20spaces'));
    });
  });

  describe('getBatchHotspots', () => {
    it('fetches hotspots for multiple screenshots', async () => {
      let client = createMockClient({});

      await getBatchHotspots(client, ['screenshot1', 'screenshot2']);

      let call = client.getLastCall();
      assert.strictEqual(call.endpoint, '/api/sdk/screenshots/hotspots');
      assert.strictEqual(call.options.method, 'POST');

      let body = JSON.parse(call.options.body);
      assert.deepStrictEqual(body.screenshot_names, [
        'screenshot1',
        'screenshot2',
      ]);
    });

    it('includes window size', async () => {
      let client = createMockClient({});

      await getBatchHotspots(client, ['screenshot1'], { windowSize: 50 });

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.windowSize, 50);
    });

    it('uses default window size', async () => {
      let client = createMockClient({});

      await getBatchHotspots(client, ['screenshot1']);

      let body = JSON.parse(client.getLastCall().options.body);
      assert.strictEqual(body.windowSize, 20);
    });
  });

  describe('getTokenContext', () => {
    it('fetches token context', async () => {
      let client = createMockClient({
        organization: 'my-org',
        project: 'my-project',
      });

      let result = await getTokenContext(client);

      assert.strictEqual(
        client.getLastCall().endpoint,
        '/api/sdk/token/context'
      );
      assert.strictEqual(result.organization, 'my-org');
    });
  });

  describe('finalizeParallelBuild', () => {
    it('finalizes parallel build', async () => {
      let client = createMockClient({ success: true });

      await finalizeParallelBuild(client, 'parallel-123');

      let call = client.getLastCall();
      assert.strictEqual(
        call.endpoint,
        '/api/sdk/parallel/parallel-123/finalize'
      );
      assert.strictEqual(call.options.method, 'POST');
    });
  });

  describe('uploadPreviewZip', () => {
    it('uploads ZIP to correct endpoint', async () => {
      let client = createMockClient({
        success: true,
        previewUrl: 'https://preview.test',
        uploaded: 10,
      });

      let zipBuffer = Buffer.from('fake zip data');
      let result = await uploadPreviewZip(client, 'build-123', zipBuffer);

      let call = client.getLastCall();
      assert.strictEqual(
        call.endpoint,
        '/api/sdk/builds/build-123/preview/upload-zip'
      );
      assert.strictEqual(call.options.method, 'POST');
      assert.strictEqual(result.previewUrl, 'https://preview.test');
    });

    it('sends ZIP as form data', async () => {
      let client = createMockClient({ success: true });

      let zipBuffer = Buffer.from('fake zip data');
      await uploadPreviewZip(client, 'build-123', zipBuffer);

      let call = client.getLastCall();
      // Should have form-data headers
      assert.ok(call.options.headers['content-type']?.includes('multipart/form-data'));
    });
  });

  describe('getPreviewInfo', () => {
    it('fetches preview info for build', async () => {
      let client = createMockClient({
        preview_id: 'preview-123',
        status: 'active',
        preview_url: 'https://preview.test',
        file_count: 47,
      });

      let result = await getPreviewInfo(client, 'build-123');

      assert.strictEqual(
        client.getLastCall().endpoint,
        '/api/sdk/builds/build-123/preview'
      );
      assert.strictEqual(result.preview_url, 'https://preview.test');
      assert.strictEqual(result.file_count, 47);
    });

    it('returns null when preview not found (404)', async () => {
      let error = new Error('Not found');
      error.status = 404;

      let client = createMockClient(() => {
        throw error;
      });

      let result = await getPreviewInfo(client, 'build-123');

      assert.strictEqual(result, null);
    });

    it('throws on other errors', async () => {
      let error = new Error('Server error');
      error.status = 500;

      let client = createMockClient(() => {
        throw error;
      });

      await assert.rejects(
        () => getPreviewInfo(client, 'build-123'),
        /Server error/
      );
    });
  });
});
