import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import {
  createBuild,
  finalizeBuild,
  finalizeParallelBuild,
  getBuild,
  getBuildStatus,
  getBuilds,
  updateBuildStatus,
} from './build.service.js';

describe('cloud builds', () => {
  it('creates a build and reads its detail, processing status, and filtered list', async t => {
    let build = { id: 'build-1', name: 'Checkout', branch: 'feature/cart' };
    let status = {
      resource: 'build_status',
      processing: { total: 2, completed: 1 },
      comparisons: { changed: 1 },
    };
    let { client, requests } = await createCloudServer(t, request => ({
      body: request.url.endsWith('/status')
        ? status
        : request.url.includes('?branch=')
          ? { builds: [build] }
          : { build },
    }));

    assert.deepEqual(
      await createBuild(client, {
        name: 'Checkout',
        branch: 'feature/cart',
        environment: 'test',
        commit: 'abc123',
      }),
      { build }
    );
    assert.deepEqual(await getBuild(client, build.id, 'screenshots'), {
      build,
    });
    assert.deepEqual(await getBuildStatus(client, build.id), status);
    assert.deepEqual(
      await getBuilds(client, { branch: 'feature/cart', status: 'running' }),
      { builds: [build] }
    );
    assert.deepEqual(
      requests.map(({ method, url, body }) => ({ method, url, body })),
      [
        {
          method: 'POST',
          url: '/api/sdk/builds',
          body: {
            build: {
              name: 'Checkout',
              branch: 'feature/cart',
              environment: 'test',
              commit_sha: 'abc123',
            },
          },
        },
        {
          method: 'GET',
          url: '/api/sdk/builds/build-1?include=screenshots',
          body: null,
        },
        { method: 'GET', url: '/api/sdk/builds/build-1/status', body: null },
        {
          method: 'GET',
          url: '/api/sdk/builds?branch=feature%2Fcart&status=running',
          body: null,
        },
      ]
    );
  });

  it('sends build outcomes, elapsed time, and parallel finalization over HTTP', async t => {
    let { client, requests } = await createCloudServer(t, request => ({
      body: { accepted: true, ...request.body },
    }));
    assert.deepEqual(await updateBuildStatus(client, 'build-1', 'running'), {
      accepted: true,
      status: 'running',
    });
    assert.deepEqual(await finalizeBuild(client, 'build-1'), {
      accepted: true,
      status: 'completed',
    });
    assert.deepEqual(
      await finalizeBuild(client, 'build-1', false, 3000, 'Tests failed'),
      {
        accepted: true,
        status: 'failed',
        executionTimeMs: 3000,
        failureReason: 'Tests failed',
      }
    );
    assert.deepEqual(await finalizeParallelBuild(client, 'parallel-1'), {
      accepted: true,
    });
    assert.deepEqual(
      requests.map(({ method, url }) => [method, url]),
      [
        ['PUT', '/api/sdk/builds/build-1/status'],
        ['PUT', '/api/sdk/builds/build-1/status'],
        ['PUT', '/api/sdk/builds/build-1/status'],
        ['POST', '/api/sdk/parallel/parallel-1/finalize'],
      ]
    );
  });
});
