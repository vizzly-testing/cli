import { describe, expect, it } from 'vitest';
import {
  createMapping,
  createProjectToken,
  getMapping,
  getProject,
  getRecentBuilds,
  listMappings,
  listProjects,
  listProjectsWithApiToken,
  listProjectsWithOAuth,
  listProjectTokens,
  removeMapping,
  revokeProjectToken,
  switchProject,
} from '../../src/project/operations.js';

// ============================================================================
// Test Helpers - Simple stubs passed as dependencies
// ============================================================================

function createMappingStore(data = {}) {
  let store = { ...data };
  return {
    getMappings: async () => store,
    getMapping: async dir => store[dir] || null,
    saveMapping: async (dir, projectData) => {
      store[dir] = projectData;
    },
    deleteMapping: async dir => {
      delete store[dir];
    },
    // For test assertions
    _store: store,
  };
}

function createOAuthClient(responses = {}) {
  return {
    authenticatedRequest: async (url, _options) => {
      if (responses.error) {
        throw responses.error;
      }
      return responses[url] || responses.default || {};
    },
  };
}

function createApiClient(responses = {}) {
  return {
    request: async (url, _options) => {
      if (responses.error) {
        throw responses.error;
      }
      return responses[url] || responses.default || {};
    },
  };
}

// ============================================================================
// Mapping Operations Tests
// ============================================================================

describe('project/operations - mapping operations', () => {
  describe('listMappings', () => {
    it('returns empty array for empty store', async () => {
      let store = createMappingStore({});
      let result = await listMappings(store);
      expect(result).toEqual([]);
    });

    it('returns mappings with directory property', async () => {
      let store = createMappingStore({
        '/path/to/proj1': { projectSlug: 'proj1', token: 'tok1' },
        '/path/to/proj2': { projectSlug: 'proj2', token: 'tok2' },
      });

      let result = await listMappings(store);

      expect(result).toHaveLength(2);
      expect(result[0].directory).toBe('/path/to/proj1');
      expect(result[0].projectSlug).toBe('proj1');
    });
  });

  describe('getMapping', () => {
    it('returns mapping for existing directory', async () => {
      let store = createMappingStore({
        '/my/project': { projectSlug: 'my-proj', token: 'tok' },
      });

      let result = await getMapping(store, '/my/project');

      expect(result).toEqual({ projectSlug: 'my-proj', token: 'tok' });
    });

    it('returns null for non-existent directory', async () => {
      let store = createMappingStore({});
      let result = await getMapping(store, '/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createMapping', () => {
    it('creates mapping and returns result with directory', async () => {
      let store = createMappingStore({});

      let result = await createMapping(store, '/new/project', {
        projectSlug: 'new-proj',
        organizationSlug: 'my-org',
        token: 'vzt_token',
      });

      expect(result).toEqual({
        directory: '/new/project',
        projectSlug: 'new-proj',
        organizationSlug: 'my-org',
        token: 'vzt_token',
      });
      expect(store._store['/new/project']).toBeDefined();
    });

    it('throws for empty directory', async () => {
      let store = createMappingStore({});

      await expect(
        createMapping(store, '', {
          projectSlug: 'p',
          organizationSlug: 'o',
          token: 't',
        })
      ).rejects.toThrow('Directory path is required');
    });

    it('throws for missing projectSlug', async () => {
      let store = createMappingStore({});

      await expect(
        createMapping(store, '/dir', { organizationSlug: 'o', token: 't' })
      ).rejects.toThrow('Project slug is required');
    });

    it('throws for missing organizationSlug', async () => {
      let store = createMappingStore({});

      await expect(
        createMapping(store, '/dir', { projectSlug: 'p', token: 't' })
      ).rejects.toThrow('Organization slug is required');
    });

    it('throws for missing token', async () => {
      let store = createMappingStore({});

      await expect(
        createMapping(store, '/dir', {
          projectSlug: 'p',
          organizationSlug: 'o',
        })
      ).rejects.toThrow('Project token is required');
    });
  });

  describe('removeMapping', () => {
    it('removes existing mapping', async () => {
      let store = createMappingStore({
        '/my/project': { projectSlug: 'proj', token: 'tok' },
      });

      await removeMapping(store, '/my/project');

      expect(store._store['/my/project']).toBeUndefined();
    });

    it('throws for empty directory', async () => {
      let store = createMappingStore({});

      await expect(removeMapping(store, '')).rejects.toThrow(
        'Directory path is required'
      );
    });
  });

  describe('switchProject', () => {
    it('creates mapping for directory', async () => {
      let store = createMappingStore({});

      let result = await switchProject(
        store,
        '/my/dir',
        'my-proj',
        'my-org',
        'vzt_token'
      );

      expect(result.directory).toBe('/my/dir');
      expect(result.projectSlug).toBe('my-proj');
      expect(store._store['/my/dir'].token).toBe('vzt_token');
    });
  });
});

// ============================================================================
// API Operations Tests - List Projects
// ============================================================================

describe('project/operations - list projects', () => {
  describe('listProjectsWithOAuth', () => {
    it('fetches projects for all organizations', async () => {
      let client = createOAuthClient({
        '/api/auth/cli/whoami': {
          organizations: [
            { slug: 'org1', name: 'Org One' },
            { slug: 'org2', name: 'Org Two' },
          ],
        },
        '/api/project': {
          projects: [{ id: 'p1', name: 'Project 1' }],
        },
      });

      let result = await listProjectsWithOAuth(client);

      expect(result).toHaveLength(2);
      expect(result[0].organizationSlug).toBe('org1');
      expect(result[1].organizationSlug).toBe('org2');
    });

    it('returns empty array when no organizations', async () => {
      let client = createOAuthClient({
        '/api/auth/cli/whoami': { organizations: [] },
      });

      let result = await listProjectsWithOAuth(client);
      expect(result).toEqual([]);
    });
  });

  describe('listProjectsWithApiToken', () => {
    it('fetches projects from API', async () => {
      let client = createApiClient({
        '/api/project': {
          projects: [{ id: 'p1' }, { id: 'p2' }],
        },
      });

      let result = await listProjectsWithApiToken(client);
      expect(result).toHaveLength(2);
    });
  });

  describe('listProjects', () => {
    it('uses OAuth client when available', async () => {
      let oauthClient = createOAuthClient({
        '/api/auth/cli/whoami': { organizations: [{ slug: 'o', name: 'O' }] },
        '/api/project': { projects: [{ id: 'p1' }] },
      });

      let result = await listProjects({ oauthClient });

      expect(result).toHaveLength(1);
      expect(result[0].organizationSlug).toBe('o');
    });

    it('falls back to API client when OAuth fails', async () => {
      let oauthClient = createOAuthClient({ error: new Error('OAuth failed') });
      let apiClient = createApiClient({
        '/api/project': { projects: [{ id: 'api-proj' }] },
      });

      let result = await listProjects({ oauthClient, apiClient });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('api-proj');
    });

    it('returns empty array when both fail', async () => {
      let oauthClient = createOAuthClient({ error: new Error('fail') });
      let apiClient = createApiClient({ error: new Error('fail') });

      let result = await listProjects({ oauthClient, apiClient });
      expect(result).toEqual([]);
    });

    it('returns empty array when no clients', async () => {
      let result = await listProjects({});
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// API Operations Tests - Get Project
// ============================================================================

describe('project/operations - get project', () => {
  describe('getProject', () => {
    it('uses OAuth client when available', async () => {
      let oauthClient = createOAuthClient({
        '/api/project/my-proj': { project: { id: 'p1', name: 'My Project' } },
      });

      let result = await getProject({
        oauthClient,
        projectSlug: 'my-proj',
        organizationSlug: 'my-org',
      });

      expect(result.id).toBe('p1');
    });

    it('falls back to API client when OAuth fails', async () => {
      let oauthClient = createOAuthClient({ error: new Error('fail') });
      let apiClient = createApiClient({
        '/api/project/my-proj': { project: { id: 'api-p1' } },
      });

      let result = await getProject({
        oauthClient,
        apiClient,
        projectSlug: 'my-proj',
        organizationSlug: 'my-org',
      });

      expect(result.id).toBe('api-p1');
    });

    it('throws PROJECT_FETCH_FAILED when API client fails', async () => {
      let apiClient = createApiClient({ error: new Error('Network error') });

      await expect(
        getProject({
          apiClient,
          projectSlug: 'my-proj',
          organizationSlug: 'my-org',
        })
      ).rejects.toThrow('Failed to fetch project');
    });

    it('throws NO_AUTH_SERVICE when no clients', async () => {
      await expect(
        getProject({
          projectSlug: 'my-proj',
          organizationSlug: 'my-org',
        })
      ).rejects.toThrow('No authentication available');
    });
  });
});

// ============================================================================
// API Operations Tests - Recent Builds
// ============================================================================

describe('project/operations - recent builds', () => {
  describe('getRecentBuilds', () => {
    it('uses OAuth client when available', async () => {
      let oauthClient = createOAuthClient({
        '/api/build/my-proj': { builds: [{ id: 'b1' }] },
      });

      let result = await getRecentBuilds({
        oauthClient,
        projectSlug: 'my-proj',
        organizationSlug: 'my-org',
      });

      expect(result).toHaveLength(1);
    });

    it('includes query params in URL', async () => {
      let requestedUrl = null;
      let oauthClient = {
        authenticatedRequest: async (url, _opts) => {
          requestedUrl = url;
          return { builds: [] };
        },
      };

      await getRecentBuilds({
        oauthClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
        limit: 5,
        branch: 'main',
      });

      expect(requestedUrl).toContain('limit=5');
      expect(requestedUrl).toContain('branch=main');
    });

    it('returns empty array when both clients fail', async () => {
      let oauthClient = createOAuthClient({ error: new Error('fail') });
      let apiClient = createApiClient({ error: new Error('fail') });

      let result = await getRecentBuilds({
        oauthClient,
        apiClient,
        projectSlug: 'proj',
        organizationSlug: 'org',
      });

      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// API Operations Tests - Project Tokens
// ============================================================================

describe('project/operations - project tokens', () => {
  describe('createProjectToken', () => {
    it('creates token and returns it', async () => {
      let apiClient = createApiClient({
        default: { token: { id: 't1', value: 'vzt_new' } },
      });

      let result = await createProjectToken(apiClient, 'proj', 'org', {
        name: 'CI Token',
      });

      expect(result.id).toBe('t1');
    });

    it('throws NO_API_SERVICE when no client', async () => {
      await expect(
        createProjectToken(null, 'proj', 'org', { name: 'Token' })
      ).rejects.toThrow('API service not available');
    });

    it('throws TOKEN_CREATE_FAILED on error', async () => {
      let apiClient = createApiClient({ error: new Error('Failed') });

      await expect(
        createProjectToken(apiClient, 'proj', 'org', { name: 'Token' })
      ).rejects.toThrow('Failed to create project token');
    });
  });

  describe('listProjectTokens', () => {
    it('returns tokens array', async () => {
      let apiClient = createApiClient({
        default: { tokens: [{ id: 't1' }, { id: 't2' }] },
      });

      let result = await listProjectTokens(apiClient, 'proj', 'org');
      expect(result).toHaveLength(2);
    });

    it('throws NO_API_SERVICE when no client', async () => {
      await expect(listProjectTokens(null, 'proj', 'org')).rejects.toThrow(
        'API service not available'
      );
    });

    it('throws TOKENS_FETCH_FAILED on error', async () => {
      let apiClient = createApiClient({ error: new Error('Failed') });

      await expect(listProjectTokens(apiClient, 'proj', 'org')).rejects.toThrow(
        'Failed to fetch project tokens'
      );
    });
  });

  describe('revokeProjectToken', () => {
    it('calls delete endpoint', async () => {
      let deletedUrl = null;
      let apiClient = {
        request: async (url, opts) => {
          if (opts.method === 'DELETE') {
            deletedUrl = url;
          }
          return {};
        },
      };

      await revokeProjectToken(apiClient, 'proj', 'org', 'tok_123');

      expect(deletedUrl).toContain('tok_123');
    });

    it('throws NO_API_SERVICE when no client', async () => {
      await expect(
        revokeProjectToken(null, 'proj', 'org', 'tok')
      ).rejects.toThrow('API service not available');
    });

    it('throws TOKEN_REVOKE_FAILED on error', async () => {
      let apiClient = createApiClient({ error: new Error('Failed') });

      await expect(
        revokeProjectToken(apiClient, 'proj', 'org', 'tok')
      ).rejects.toThrow('Failed to revoke project token');
    });
  });
});
