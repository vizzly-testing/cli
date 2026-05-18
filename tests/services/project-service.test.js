import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProjectService } from '../../src/services/project-service.js';

function createServiceHarness({ auth = null, responses = {} } = {}) {
  let requests = [];
  let httpClient = {
    authenticatedRequest: async (endpoint, accessToken, options = {}) => {
      requests.push({ endpoint, accessToken, options });
      let response = responses[endpoint];
      if (response instanceof Error) {
        throw response;
      }
      return response || {};
    },
  };

  let service = createProjectService({
    httpClient,
    getAuthTokens: async () => auth,
  });

  return { requests, service };
}

describe('services/project-service', () => {
  it('returns empty project and build lists when the user is not authenticated', async () => {
    let { requests, service } = createServiceHarness();

    let projects = await service.listProjects();
    let builds = await service.getRecentBuilds('app', 'org', { limit: 5 });

    assert.deepEqual(projects, []);
    assert.deepEqual(builds, []);
    assert.deepEqual(requests, []);
  });

  it('lists authenticated projects with organization context', async () => {
    let { requests, service } = createServiceHarness({
      auth: { accessToken: 'access-123' },
      responses: {
        '/api/auth/cli/whoami': {
          organizations: [{ slug: 'org-a', name: 'Org A' }],
        },
        '/api/project': {
          projects: [{ slug: 'web', name: 'Web' }],
        },
      },
    });

    let projects = await service.listProjects();

    assert.deepEqual(projects, [
      {
        slug: 'web',
        name: 'Web',
        organizationSlug: 'org-a',
        organizationName: 'Org A',
      },
    ]);
    assert.deepEqual(requests, [
      {
        endpoint: '/api/auth/cli/whoami',
        accessToken: 'access-123',
        options: { method: 'GET' },
      },
      {
        endpoint: '/api/project',
        accessToken: 'access-123',
        options: { method: 'GET', headers: { 'X-Organization': 'org-a' } },
      },
    ]);
  });

  it('fetches recent authenticated builds with filters', async () => {
    let { requests, service } = createServiceHarness({
      auth: { accessToken: 'access-123' },
      responses: {
        '/api/build/web?limit=5&branch=main': {
          builds: [{ id: 'build-1', status: 'completed' }],
        },
      },
    });

    let builds = await service.getRecentBuilds('web', 'org-a', {
      limit: 5,
      branch: 'main',
    });

    assert.deepEqual(builds, [{ id: 'build-1', status: 'completed' }]);
    assert.deepEqual(requests, [
      {
        endpoint: '/api/build/web?limit=5&branch=main',
        accessToken: 'access-123',
        options: { method: 'GET', headers: { 'X-Organization': 'org-a' } },
      },
    ]);
  });

  it('returns empty results when authenticated project lookup fails', async () => {
    let { service } = createServiceHarness({
      auth: { accessToken: 'access-123' },
      responses: {
        '/api/auth/cli/whoami': new Error('network down'),
      },
    });

    let projects = await service.listProjects();

    assert.deepEqual(projects, []);
  });
});
