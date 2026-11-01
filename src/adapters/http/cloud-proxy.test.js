import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { createAuthService } from '../../domains/auth/auth.service.js';
import {
  clearAuthTokens,
  saveAuthTokens,
} from '../../domains/auth/token-store.js';
import { createCloudProxyRouter } from './cloud-proxy.js';

async function isolateHome(t) {
  let originalHome = process.env.VIZZLY_HOME;
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-cloud-routes-'));
  process.env.VIZZLY_HOME = directory;
  t.after(async () => {
    if (originalHome === undefined) delete process.env.VIZZLY_HOME;
    else process.env.VIZZLY_HOME = originalHome;
    await rm(directory, { recursive: true, force: true });
  });
}

async function serveProxy(t, authService) {
  let router = createCloudProxyRouter({ authService });
  let handlerError;
  let server = createServer(async (req, res) => {
    try {
      let url = new URL(req.url, 'http://localhost');
      if (!(await router(req, res, url.pathname, url))) {
        res.writeHead(418);
        res.end('Outside cloud router');
      }
    } catch (error) {
      handlerError ||= error;
      res.writeHead(500);
      res.end(error.message);
    }
  });
  let listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (handlerError) throw handlerError;
  });
  let baseUrl = `http://127.0.0.1:${server.address().port}`;
  return (path, options) => fetch(`${baseUrl}${path}`, options);
}

function downloadRequest(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

test('saved authentication lets the browser browse projects/builds and download selected baselines', async t => {
  await isolateHome(t);
  await saveAuthTokens({ accessToken: 'saved-cloud-token' });
  let { client, requests } = await createCloudServer(t, request => {
    if (request.url === '/api/cli/projects') {
      return { body: { projects: [{ slug: 'my-project' }] } };
    }
    if (request.method === 'GET') {
      return { body: { builds: [{ id: 'build-123' }] } };
    }
    return {
      body: {
        downloaded: 2,
        success: false,
        message: 'Cloud download response',
      },
    };
  });
  let request = await serveProxy(
    t,
    createAuthService({ apiUrl: client.getBaseUrl() })
  );
  let projects = await request('/api/cloud/projects');
  assert.equal(projects.status, 200);
  assert.deepEqual(await projects.json(), {
    projects: [{ slug: 'my-project' }],
  });

  let builds = await request(
    '/api/cloud/organizations/my%20org/projects/my%20project/builds?limit=10&branch=feature%2Fnew+page'
  );
  assert.equal(builds.status, 200);
  assert.deepEqual(await builds.json(), { builds: [{ id: 'build-123' }] });
  await request('/api/cloud/organizations/org/projects/project/builds');
  await request('/api/cloud/organizations/org/projects/project/builds?limit=');
  let download = await request(
    '/api/cloud/baselines/download',
    downloadRequest({ buildId: 'build-123', screenshotNames: ['home', 'cart'] })
  );
  assert.equal(download.status, 200);
  assert.deepEqual(await download.json(), {
    success: false,
    message: 'Cloud download response',
    downloaded: 2,
  });

  assert.deepEqual(
    requests.map(({ method, url }) => ({ method, url })),
    [
      { method: 'GET', url: '/api/cli/projects' },
      {
        method: 'GET',
        url: '/api/cli/organizations/my%20org/projects/my%20project/builds?limit=10&branch=feature%2Fnew+page',
      },
      {
        method: 'GET',
        url: '/api/cli/organizations/org/projects/project/builds?limit=20',
      },
      {
        method: 'GET',
        url: '/api/cli/organizations/org/projects/project/builds?limit=20',
      },
      { method: 'POST', url: '/api/cli/baselines/download' },
    ]
  );
  assert(
    requests.every(
      item => item.headers.authorization === 'Bearer saved-cloud-token'
    )
  );
  assert.equal(requests.at(-1).headers['content-type'], 'application/json');
  assert.deepEqual(requests.at(-1).body, {
    buildId: 'build-123',
    screenshotNames: ['home', 'cart'],
  });
});

test('cloud routing and input errors are handled locally without making cloud requests', async t => {
  await isolateHome(t);
  await saveAuthTokens({ accessToken: 'saved-cloud-token' });
  let { client, requests } = await createCloudServer(t, () => ({ body: {} }));
  let request = await serveProxy(
    t,
    createAuthService({ apiUrl: client.getBaseUrl() })
  );
  let outside = await request('/other');
  assert.equal(outside.status, 418);
  for (let path of ['/api/cloud/unknown', '/api/cloud/projects']) {
    let response = await request(path, { method: 'DELETE' });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'Cloud API endpoint not found',
    });
  }
  let missingBuild = await request(
    '/api/cloud/baselines/download',
    downloadRequest({ screenshotNames: ['home'] })
  );
  assert.equal(missingBuild.status, 400);
  assert.deepEqual(await missingBuild.json(), { error: 'buildId is required' });
  let invalidBody = await request('/api/cloud/baselines/download', {
    method: 'POST',
    body: '{',
  });
  assert.equal(invalidBody.status, 500);
  assert.deepEqual(await invalidBody.json(), { error: 'Invalid JSON' });
  let invalidSlug = await request(
    '/api/cloud/organizations/%ZZ/projects/project/builds'
  );
  assert.equal(invalidSlug.status, 500);
  assert.deepEqual(await invalidSlug.json(), { error: 'URI malformed' });
  assert.equal(requests.length, 0);

  let unavailable = await serveProxy(t, null);
  let response = await unavailable('/api/cloud/projects');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Auth service not available',
  });
});

test('missing or rejected saved authentication produces an empty project list for the browser', async t => {
  await isolateHome(t);
  await clearAuthTokens();
  let { client, requests } = await createCloudServer(t, () => ({
    status: 401,
    body: { error: 'Expired access token' },
  }));
  let request = await serveProxy(
    t,
    createAuthService({ apiUrl: client.getBaseUrl() })
  );
  let missing = await request('/api/cloud/projects');
  assert.equal(missing.status, 200);
  assert.deepEqual(await missing.json(), {
    projects: [],
    authenticated: false,
  });
  assert.equal(requests.length, 0);

  await saveAuthTokens({ accessToken: 'rejected-token' });
  let rejected = await request('/api/cloud/projects');
  assert.equal(rejected.status, 200);
  assert.deepEqual(await rejected.json(), {
    projects: [],
    authenticated: false,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.authorization, 'Bearer rejected-token');
});

test('cloud response defaults and failures remain visible through each product route', async t => {
  await isolateHome(t);
  await saveAuthTokens({ accessToken: 'saved-cloud-token' });
  let failing = false;
  let { client } = await createCloudServer(t, () => ({
    status: failing ? 503 : 200,
    body: failing ? { error: 'Cloud is unavailable' } : {},
  }));
  let request = await serveProxy(
    t,
    createAuthService({ apiUrl: client.getBaseUrl() })
  );
  let projects = await request('/api/cloud/projects');
  assert.deepEqual(await projects.json(), { projects: [] });
  let builds = await request(
    '/api/cloud/organizations/org/projects/proj/builds'
  );
  assert.deepEqual(await builds.json(), { builds: [] });
  let download = await request(
    '/api/cloud/baselines/download',
    downloadRequest({ buildId: 'build-123' })
  );
  assert.deepEqual(await download.json(), {
    success: true,
    message: 'Baselines downloaded from build build-123',
  });

  failing = true;
  for (let [path, options, endpoint] of [
    ['/api/cloud/projects', undefined, '/api/cli/projects'],
    [
      '/api/cloud/organizations/org/projects/proj/builds',
      undefined,
      '/api/cli/organizations/org/projects/proj/builds?limit=20',
    ],
    [
      '/api/cloud/baselines/download',
      downloadRequest({ buildId: 'build-123' }),
      '/api/cli/baselines/download',
    ],
  ]) {
    let response = await request(path, options);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: `API request failed: 503 - Cloud is unavailable (${endpoint})`,
    });
  }
});
