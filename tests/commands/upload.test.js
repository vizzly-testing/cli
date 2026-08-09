import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  constructBuildUrl,
  validateUploadOptions,
} from '../../src/commands/upload.js';

describe('validateUploadOptions', () => {
  it('accepts a valid upload configuration', () => {
    assert.deepStrictEqual(
      validateUploadOptions('./screenshots', {
        metadata: '{"suite":"visual"}',
        threshold: '2',
        minClusterSize: '2',
        batchSize: '10',
        uploadTimeout: '30000',
      }),
      []
    );
  });

  it('reports malformed metadata and numeric options', () => {
    assert.deepStrictEqual(
      validateUploadOptions(null, {
        metadata: 'not-json',
        threshold: '2abc',
        minClusterSize: '2.5',
        batchSize: '0',
        uploadTimeout: '-1',
      }),
      [
        'Screenshots path is required',
        'Invalid JSON in --metadata option',
        'Threshold must be a non-negative number (CIEDE2000 Delta E)',
        'Min cluster size must be a positive integer',
        'Batch size must be a positive integer',
        'Upload timeout must be a positive integer (milliseconds)',
      ]
    );
  });
});

describe('constructBuildUrl', () => {
  it('uses the organization and project from token context', async () => {
    let url = await constructBuildUrl(
      'build-123',
      'https://app.vizzly.dev/api',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => ({
          organization: { slug: 'my-org' },
          project: { slug: 'my-project' },
        }),
      }
    );

    assert.strictEqual(
      url,
      'https://app.vizzly.dev/my-org/my-project/builds/build-123'
    );
  });

  it('falls back to a build URL when context is unavailable', async () => {
    let url = await constructBuildUrl(
      'build-123',
      'https://api.example.com/api/v1',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => {
          throw new Error('context unavailable');
        },
      }
    );

    assert.strictEqual(url, 'https://api.example.com/builds/build-123');
  });

  it('does not strip api from a hostname', async () => {
    let url = await constructBuildUrl(
      'build-123',
      'https://api.example.com/api/v1',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => ({}),
      }
    );

    assert.strictEqual(url, 'https://api.example.com/builds/build-123');
  });
});
