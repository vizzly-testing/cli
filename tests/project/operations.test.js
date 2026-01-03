import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createMapping,
  createProjectToken,
  getMapping,
  getProject,
  getProjectWithApiToken,
  getProjectWithOAuth,
  getRecentBuilds,
  getRecentBuildsWithApiToken,
  getRecentBuildsWithOAuth,
  listMappings,
  listProjects,
  listProjectsWithApiToken,
  listProjectsWithOAuth,
  listProjectTokens,
  removeMapping,
  revokeProjectToken,
  switchProject,
} from '../../src/project/operations.js';

describe('project/operations', () => {
  describe('listMappings', () => {
    it('returns array of mappings with directory included', async () => {
      let store = createMockMappingStore({
        '/path/a': { projectSlug: 'proj-a', token: 'tok-a' },
        '/path/b': { projectSlug: 'proj-b', token: 'tok-b' },
      });

      let result = await listMappings(store);

      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], {
        directory: '/path/a',
        projectSlug: 'proj-a',
        token: 'tok-a',
      });
    });

    it('returns empty array for no mappings', async () => {
      let store = createMockMappingStore({});

      let result = await listMappings(store);

      assert.deepStrictEqual(result, []);
    });
  });

  describe('getMapping', () => {
    it('returns mapping for directory', async () => {
      let store = createMockMappingStore({});
      store.getMapping = async _dir => ({ projectSlug: 'proj', token: 'tok' });

      let result = await getMapping(store, '/my/path');

      assert.deepStrictEqual(result, { projectSlug: 'proj', token: 'tok' });
    });

    it('returns null for missing directory', async () => {
      let store = createMockMappingStore({});
      store.getMapping = async () => null;

      let result = await getMapping(store, '/unknown');

      assert.strictEqual(result, null);
    });
  });

  describe('createMapping', () => {
    it('creates and returns mapping with directory', async () => {
      let savedDir = null;
      let _savedData = null;

      let store = {
        saveMapping: async (dir, data) => {
          savedDir = dir;
          _savedData = data;
        },
      };

      let result = await createMapping(store, '/my/path', {
        projectSlug: 'proj',
        organizationSlug: 'org',
        token: 'tok',
      });

      assert.strictEqual(savedDir, '/my/path');
      assert.deepStrictEqual(result, {
        directory: '/my/path',
        projectSlug: 'proj',
        organizationSlug: 'org',
        token: 'tok',
      });
    });

    it('throws for invalid directory', async () => {
      let store = { saveMapping: async () => {} };

      await assert.rejects(
        () => createMapping(store, '', { projectSlug: 'p' }),
        {
          code: 'INVALID_DIRECTORY',
        }
      );
    });

    it('throws for missing project data', async () => {
      let store = { saveMapping: async () => {} };

      await assert.rejects(() => createMapping(store, '/path', {}), {
        code: 'INVALID_PROJECT_DATA',
      });
    });
  });

  describe('removeMapping', () => {
    it('removes mapping for directory', async () => {
      let deletedDir = null;
      let store = {
        deleteMapping: async dir => {
          deletedDir = dir;
        },
      };

      await removeMapping(store, '/my/path');

      assert.strictEqual(deletedDir, '/my/path');
    });

    it('throws for invalid directory', async () => {
      let store = { deleteMapping: async () => {} };

      await assert.rejects(() => removeMapping(store, ''), {
        code: 'INVALID_DIRECTORY',
      });
    });
  });

  describe('switchProject', () => {
    it('creates mapping with project data', async () => {
      let savedDir = null;
      let savedData = null;

      let store = {
        saveMapping: async (dir, data) => {
          savedDir = dir;
          savedData = data;
        },
      };

      let result = await switchProject(store, '/path', 'proj', 'org', 'tok');

      assert.strictEqual(savedDir, '/path');
      assert.deepStrictEqual(savedData, {
        projectSlug: 'proj',
        organizationSlug: 'org',
        token: 'tok',
      });
      assert.strictEqual(result.projectSlug, 'proj');
    });
  });

  describe('listProjectsWithOAuth', () => {
    it('fetches projects for all organizations', async () => {
      let client = createMockOAuthClient({
        '/api/auth/cli/whoami': {
          organizations: [
            { slug: 'org1', name: 'Org 1' },
            { slug: 'org2', name: 'Org 2' },
          ],
        },
        '/api/project': { projects: [{ id: 'p1', name: 'Project 1' }] },
      });

      let result = await listProjectsWithOAuth(client);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].organizationSlug, 'org1');
    });

    it('returns empty array when no organizations', async () => {
      let client = createMockOAuthClient({
        '/api/auth/cli/whoami': { organizations: [] },
      });

      let result = await listProjectsWithOAuth(client);

      assert.deepStrictEqual(result, []);
    });

    it('silently skips failed org requests and returns successful ones', async () => {
      let client = {
        authenticatedRequest: async (endpoint, options) => {
          if (endpoint === '/api/auth/cli/whoami') {
            return {
              organizations: [
                { slug: 'failing-org', name: 'Failing Org' },
                { slug: 'successful-org', name: 'Successful Org' },
              ],
            };
          }
          // Fail requests for 'failing-org', succeed for 'successful-org'
          if (options?.headers?.['X-Organization'] === 'failing-org') {
            throw new Error('Network error for failing-org');
          }
          return {
            projects: [{ id: 'p1', name: 'Project from successful org' }],
          };
        },
      };

      let result = await listProjectsWithOAuth(client);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].organizationSlug, 'successful-org');
      assert.strictEqual(result[0].name, 'Project from successful org');
    });
  });

  describe('listProjectsWithApiToken', () => {
    it('fetches projects using API client', async () => {
      let client = createMockApiClient({
        '/api/project': { projects: [{ id: 'p1' }, { id: 'p2' }] },
      });

      let result = await listProjectsWithApiToken(client);

      assert.strictEqual(result.length, 2);
    });
  });

  describe('listProjects', () => {
    it('uses OAuth first when available', async () => {
      let oauthCalled = false;
      let apiCalled = false;

      let oauthClient = {
        authenticatedRequest: async () => {
          oauthCalled = true;
          return { organizations: [] };
        },
      };

      let apiClient = {
        request: async () => {
          apiCalled = true;
          return { projects: [] };
        },
      };

      await listProjects({ oauthClient, apiClient });

      assert.strictEqual(oauthCalled, true);
      assert.strictEqual(apiCalled, false);
    });

    it('falls back to API token when OAuth fails', async () => {
      let apiCalled = false;

      let oauthClient = {
        authenticatedRequest: async () => {
          throw new Error('OAuth failed');
        },
      };

      let apiClient = {
        request: async () => {
          apiCalled = true;
          return { projects: [{ id: 'p1' }] };
        },
      };

      let result = await listProjects({ oauthClient, apiClient });

      assert.strictEqual(apiCalled, true);
      assert.strictEqual(result.length, 1);
    });

    it('returns empty array when API token fails', async () => {
      let apiClient = {
        request: async () => {
          throw new Error('API failed');
        },
      };

      let result = await listProjects({ apiClient });

      assert.deepStrictEqual(result, []);
    });

    it('returns empty array when no clients available', async () => {
      let result = await listProjects({});

      assert.deepStrictEqual(result, []);
    });
  });

  describe('getProjectWithOAuth', () => {
    it('fetches project with org header', async () => {
      let capturedHeaders = null;
      let client = {
        authenticatedRequest: async (_endpoint, options) => {
          capturedHeaders = options.headers;
          return { project: { id: 'p1', name: 'Project' } };
        },
      };

      let result = await getProjectWithOAuth(client, 'my-project', 'my-org');

      assert.deepStrictEqual(capturedHeaders, { 'X-Organization': 'my-org' });
      assert.strictEqual(result.id, 'p1');
    });
  });

  describe('getProjectWithApiToken', () => {
    it('fetches project using API client', async () => {
      let client = createMockApiClient({
        '/api/project/my-project': {
          project: { id: 'p1', slug: 'my-project' },
        },
      });

      let result = await getProjectWithApiToken(client, 'my-project', 'my-org');

      assert.strictEqual(result.id, 'p1');
    });
  });

  describe('getProject', () => {
    it('uses OAuth first when available', async () => {
      let oauthClient = {
        authenticatedRequest: async () => ({
          project: { id: 'p1', name: 'OAuth Project' },
        }),
      };

      let result = await getProject({
        oauthClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      assert.strictEqual(result.name, 'OAuth Project');
    });

    it('falls back to API token when OAuth fails', async () => {
      let oauthClient = {
        authenticatedRequest: async () => {
          throw new Error('OAuth failed');
        },
      };

      let apiClient = {
        request: async () => ({
          project: { id: 'p1', name: 'API Project' },
        }),
      };

      let result = await getProject({
        oauthClient,
        apiClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      assert.strictEqual(result.name, 'API Project');
    });

    it('throws wrapped error when API token fails', async () => {
      let apiClient = {
        request: async () => {
          throw new Error('API failed');
        },
      };

      await assert.rejects(
        () =>
          getProject({
            apiClient,
            projectSlug: 'proj',
            organizationSlug: 'org',
          }),
        { code: 'PROJECT_FETCH_FAILED' }
      );
    });

    it('throws no auth error when no clients available', async () => {
      await assert.rejects(
        () =>
          getProject({
            projectSlug: 'proj',
            organizationSlug: 'org',
          }),
        { code: 'NO_AUTH_SERVICE' }
      );
    });
  });

  describe('getRecentBuildsWithOAuth', () => {
    it('fetches builds with org header', async () => {
      let capturedEndpoint = null;
      let client = {
        authenticatedRequest: async endpoint => {
          capturedEndpoint = endpoint;
          return { builds: [{ id: 'b1' }, { id: 'b2' }] };
        },
      };

      let result = await getRecentBuildsWithOAuth(
        client,
        'my-project',
        'my-org',
        { limit: 5 }
      );

      assert.ok(capturedEndpoint.includes('limit=5'));
      assert.strictEqual(result.length, 2);
    });
  });

  describe('getRecentBuildsWithApiToken', () => {
    it('fetches builds using API client', async () => {
      let client = {
        request: async () => ({
          builds: [{ id: 'b1' }],
        }),
      };

      let result = await getRecentBuildsWithApiToken(
        client,
        'my-project',
        'my-org'
      );

      assert.strictEqual(result.length, 1);
    });
  });

  describe('getRecentBuilds', () => {
    it('uses OAuth first when available', async () => {
      let oauthClient = {
        authenticatedRequest: async () => ({
          builds: [{ id: 'oauth-build' }],
        }),
      };

      let result = await getRecentBuilds({
        oauthClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      assert.strictEqual(result[0].id, 'oauth-build');
    });

    it('falls back to API token when OAuth fails', async () => {
      let oauthClient = {
        authenticatedRequest: async () => {
          throw new Error('OAuth failed');
        },
      };

      let apiClient = {
        request: async () => ({
          builds: [{ id: 'api-build' }],
        }),
      };

      let result = await getRecentBuilds({
        oauthClient,
        apiClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      assert.strictEqual(result[0].id, 'api-build');
    });

    it('returns empty array when API token fails', async () => {
      let apiClient = {
        request: async () => {
          throw new Error('API failed');
        },
      };

      let result = await getRecentBuilds({
        apiClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      assert.deepStrictEqual(result, []);
    });

    it('returns empty array when no clients available', async () => {
      let result = await getRecentBuilds({
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      assert.deepStrictEqual(result, []);
    });
  });

  describe('createProjectToken', () => {
    it('creates token and returns extracted result', async () => {
      let capturedBody = null;
      let client = {
        request: async (_endpoint, options) => {
          capturedBody = JSON.parse(options.body);
          return { token: { id: 't1', value: 'vzt_xxx' } };
        },
      };

      let result = await createProjectToken(client, 'proj', 'org', {
        name: 'My Token',
        description: 'Test token',
      });

      assert.deepStrictEqual(capturedBody, {
        name: 'My Token',
        description: 'Test token',
      });
      assert.strictEqual(result.id, 't1');
    });

    it('throws when no API client', async () => {
      await assert.rejects(
        () => createProjectToken(null, 'proj', 'org', { name: 'tok' }),
        { code: 'NO_API_SERVICE' }
      );
    });

    it('throws wrapped error on failure', async () => {
      let client = {
        request: async () => {
          throw new Error('Create failed');
        },
      };

      await assert.rejects(
        () => createProjectToken(client, 'proj', 'org', { name: 'tok' }),
        { code: 'TOKEN_CREATE_FAILED' }
      );
    });
  });

  describe('listProjectTokens', () => {
    it('lists tokens for project', async () => {
      let client = {
        request: async () => ({
          tokens: [{ id: 't1' }, { id: 't2' }],
        }),
      };

      let result = await listProjectTokens(client, 'proj', 'org');

      assert.strictEqual(result.length, 2);
    });

    it('throws when no API client', async () => {
      await assert.rejects(() => listProjectTokens(null, 'proj', 'org'), {
        code: 'NO_API_SERVICE',
      });
    });

    it('throws wrapped error on failure', async () => {
      let client = {
        request: async () => {
          throw new Error('Fetch failed');
        },
      };

      await assert.rejects(() => listProjectTokens(client, 'proj', 'org'), {
        code: 'TOKENS_FETCH_FAILED',
      });
    });
  });

  describe('revokeProjectToken', () => {
    it('revokes token by ID', async () => {
      let capturedEndpoint = null;
      let capturedMethod = null;
      let client = {
        request: async (endpoint, options) => {
          capturedEndpoint = endpoint;
          capturedMethod = options.method;
        },
      };

      await revokeProjectToken(client, 'proj', 'org', 'tok_123');

      assert.ok(capturedEndpoint.includes('tok_123'));
      assert.strictEqual(capturedMethod, 'DELETE');
    });

    it('throws when no API client', async () => {
      await assert.rejects(
        () => revokeProjectToken(null, 'proj', 'org', 'tok_123'),
        { code: 'NO_API_SERVICE' }
      );
    });

    it('throws wrapped error on failure', async () => {
      let client = {
        request: async () => {
          throw new Error('Revoke failed');
        },
      };

      await assert.rejects(
        () => revokeProjectToken(client, 'proj', 'org', 'tok_123'),
        { code: 'TOKEN_REVOKE_FAILED' }
      );
    });
  });
});

// Test helpers

function createMockMappingStore(mappings) {
  return {
    getMappings: async () => mappings,
    getMapping: async dir => mappings[dir] || null,
    saveMapping: async () => {},
    deleteMapping: async () => {},
  };
}

function createMockOAuthClient(responses) {
  return {
    authenticatedRequest: async (endpoint, _options = {}) => {
      for (let key of Object.keys(responses)) {
        if (endpoint.includes(key)) {
          return responses[key];
        }
      }
      throw new Error(`No mock response for ${endpoint}`);
    },
  };
}

function createMockApiClient(responses) {
  return {
    request: async (endpoint, _options = {}) => {
      for (let key of Object.keys(responses)) {
        if (endpoint.includes(key)) {
          return responses[key];
        }
      }
      throw new Error(`No mock response for ${endpoint}`);
    },
  };
}
