import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  fixtureAuthorization,
  saveFixtureAuth,
} from '../../../tests/helpers/auth-session.js';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import { createProjectService } from '../../domains/projects/project.service.js';
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
  return directory;
}

async function serveProxy(t, projectService) {
  let router = createCloudProxyRouter({ projectService });
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

function page(items, query) {
  let limit = Number(query.get('limit'));
  let offset = Number(query.get('offset'));
  let values = items.slice(offset, offset + limit);
  return {
    values,
    meta: {
      total: items.length,
      limit,
      offset,
      hasMore: offset + values.length < items.length,
    },
  };
}

function downloadRequest(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

test('cloud reads use the selected user session and SDK contracts', async t => {
  let home = await isolateHome(t);
  let projects = Array.from({ length: 61 }, (_, index) => ({
    id: `project-${index}`,
    slug: `project-${index}`,
    organizationSlug: 'my org',
  }));
  let { client, requests } = await createCloudServer(t, request => {
    let url = new URL(request.url, 'http://cloud');
    if (url.pathname === '/api/sdk/projects') {
      let { values, meta } = page(projects, url.searchParams);
      return { body: { projects: values, meta } };
    }
    if (url.pathname === '/api/sdk/builds') {
      let { values, meta } = page(
        [{ id: 'build-1' }, { id: 'build-2' }],
        url.searchParams
      );
      return { body: { builds: values, meta } };
    }
    if (url.pathname === '/api/sdk/builds/build-1/tdd-baselines') {
      return {
        body: {
          build: { id: 'build-1' },
          screenshots: [{ name: 'home' }, { name: 'cart' }],
          signatureProperties: ['browser'],
        },
      };
    }
    return {
      status: 404,
      body: { error: `Unexpected cloud request: ${url.pathname}` },
    };
  });
  await saveFixtureAuth(home, client.getBaseUrl());
  let request = await serveProxy(
    t,
    createProjectService({ apiUrl: client.getBaseUrl() })
  );

  let projectResponse = await request('/api/cloud/projects');
  assert.equal(projectResponse.status, 200);
  assert.deepEqual((await projectResponse.json()).projects, projects);
  let buildsResponse = await request(
    '/api/cloud/organizations/my%20org/projects/project-1/builds?limit=2&branch=feature%2Fnew+page'
  );
  assert.equal(buildsResponse.status, 200);
  assert.deepEqual(await buildsResponse.json(), {
    builds: [{ id: 'build-1' }, { id: 'build-2' }],
  });
  let baselineResponse = await request(
    '/api/cloud/baselines/download',
    downloadRequest({ buildId: 'build-1', screenshotNames: ['cart'] })
  );
  assert.equal(baselineResponse.status, 200);
  assert.deepEqual(await baselineResponse.json(), {
    success: true,
    message: 'Baselines downloaded from build build-1',
    build: { id: 'build-1' },
    screenshots: [{ name: 'cart' }],
    signatureProperties: ['browser'],
  });

  assert.deepEqual(
    requests.map(({ method, url }) => [method, url]),
    [
      ['GET', '/api/sdk/projects?limit=50&offset=0'],
      ['GET', '/api/sdk/projects?limit=50&offset=50'],
      [
        'GET',
        '/api/sdk/builds?organization=my+org&project=project-1&branch=feature%2Fnew+page&limit=2&offset=0',
      ],
      ['GET', '/api/sdk/builds/build-1/tdd-baselines'],
    ]
  );
  assert(
    requests.every(item => item.headers.authorization === 'Bearer fixture-user')
  );
  assert(
    requests
      .slice(0, 3)
      .every(item => item.headers['vizzly-api-version'] === '2026-09-12')
  );
});

test('cloud route validation and unavailable-service responses stay local', async t => {
  let home = await isolateHome(t);
  let { client, requests } = await createCloudServer(t, () => ({ body: {} }));
  await saveFixtureAuth(home, client.getBaseUrl());
  let request = await serveProxy(
    t,
    createProjectService({ apiUrl: client.getBaseUrl() })
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
    error: 'Project service not available',
  });
});

test('each project read uses the currently saved user session', async t => {
  let home = await isolateHome(t);
  let { client, requests } = await createCloudServer(t, request => {
    if (request.url.startsWith('/api/sdk/projects?')) {
      let project =
        request.headers.authorization === 'Bearer session-a'
          ? { id: 'project-a', slug: 'project-a' }
          : { id: 'project-b', slug: 'project-b' };
      return {
        body: {
          projects: [project],
          meta: { total: 1, limit: 50, offset: 0, hasMore: false },
        },
      };
    }
    return { status: 404, body: { error: 'Unexpected cloud request' } };
  });
  let sessionA = {
    ...fixtureAuthorization,
    sessionId: '8bfb8060-ef8e-4c3e-b58b-ffb826ba8991',
  };
  let sessionB = {
    ...fixtureAuthorization,
    sessionId: '8bfb8060-ef8e-4c3e-b58b-ffb826ba8992',
  };
  await saveFixtureAuth(home, client.getBaseUrl(), {
    accessToken: 'session-a',
    authorization: sessionA,
  });
  let request = await serveProxy(
    t,
    createProjectService({ apiUrl: client.getBaseUrl() })
  );

  let firstRead = await request('/api/cloud/projects');
  assert.deepEqual((await firstRead.json()).projects, [
    { id: 'project-a', slug: 'project-a' },
  ]);
  await saveFixtureAuth(home, client.getBaseUrl(), {
    accessToken: 'session-b',
    authorization: sessionB,
  });
  let secondRead = await request('/api/cloud/projects');
  assert.deepEqual((await secondRead.json()).projects, [
    { id: 'project-b', slug: 'project-b' },
  ]);
  assert.deepEqual(
    requests.map(item => item.headers.authorization),
    ['Bearer session-a', 'Bearer session-b']
  );
});

test('signed-out project reads stay empty without hiding a saved-session error', async t => {
  let home = await isolateHome(t);
  let { client, requests } = await createCloudServer(t, request => {
    if (request.url === '/api/auth/cli/refresh') {
      return { status: 401, body: { error: 'Refresh rejected' } };
    }
    return { status: 401, body: { error: 'Expired session' } };
  });
  let request = await serveProxy(
    t,
    createProjectService({ apiUrl: client.getBaseUrl() })
  );

  let signedOut = await request('/api/cloud/projects');
  assert.equal(signedOut.status, 200);
  assert.deepEqual(await signedOut.json(), {
    projects: [],
    authenticated: false,
  });
  assert.equal(requests.length, 0);

  await saveFixtureAuth(home, client.getBaseUrl(), {
    expiresAt: '2000-01-01T00:00:00.000Z',
  });
  let expired = await request('/api/cloud/projects');
  assert.equal(expired.status, 401);
  assert.match((await expired.json()).error, /saved login has expired/i);
  assert.deepEqual(
    requests.map(({ method, url }) => [method, url]),
    [['POST', '/api/auth/cli/refresh']]
  );
});
