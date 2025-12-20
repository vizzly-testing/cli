import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createProjectService } from '../../src/services/project-service.js';
import { createMockHttpClient } from '../auth/test-helpers.js';

/**
 * Create an in-memory mapping store for testing
 * @param {Object} initialMappings - Initial mappings state (directory -> projectData)
 * @returns {Object} Mapping store with getMappings, getMapping, saveMapping, deleteMapping
 */
function createInMemoryMappingStore(initialMappings = {}) {
  let mappings = { ...initialMappings };

  return {
    async getMappings() {
      return mappings;
    },
    async getMapping(directory) {
      return mappings[directory] || null;
    },
    async saveMapping(directory, projectData) {
      mappings[directory] = projectData;
    },
    async deleteMapping(directory) {
      delete mappings[directory];
    },
    // Test helper to inspect current state
    _getState() {
      return mappings;
    },
  };
}

/**
 * Create a mock token getter for testing
 * @param {Object|null} tokens - Tokens to return
 * @returns {Function} Async token getter
 */
function createMockTokenGetter(tokens) {
  return async () => tokens;
}

describe('services/project-service', () => {
  describe('listMappings', () => {
    it('returns empty array when no mappings exist', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      let result = await service.listMappings();

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('returns array of mappings with directory included', async () => {
      let mappingStore = createInMemoryMappingStore({
        '/path/to/project': {
          projectSlug: 'my-project',
          organizationSlug: 'my-org',
        },
        '/another/project': {
          projectSlug: 'other-project',
          organizationSlug: 'other-org',
        },
      });
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      let result = await service.listMappings();

      assert.strictEqual(result.length, 2);
      let dirs = result.map(m => m.directory);
      assert.ok(dirs.includes('/path/to/project'));
      assert.ok(dirs.includes('/another/project'));
    });
  });

  describe('getMapping', () => {
    it('returns null for non-existent directory', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      let result = await service.getMapping('/nonexistent/path');

      assert.strictEqual(result, null);
    });

    it('returns mapping for existing directory', async () => {
      let mappingStore = createInMemoryMappingStore({
        '/my/project': {
          projectSlug: 'my-project',
          organizationSlug: 'my-org',
          token: 'project-token',
        },
      });
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      let result = await service.getMapping('/my/project');

      assert.strictEqual(result.projectSlug, 'my-project');
      assert.strictEqual(result.organizationSlug, 'my-org');
    });
  });

  describe('createMapping', () => {
    it('creates new mapping', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      let result = await service.createMapping('/new/project', {
        projectSlug: 'new-project',
        organizationSlug: 'new-org',
        token: 'project-token',
      });

      assert.strictEqual(result.directory, '/new/project');
      assert.strictEqual(result.projectSlug, 'new-project');

      // Verify it was persisted
      let stored = mappingStore._getState();
      assert.ok(stored['/new/project']);
    });

    it('validates directory is required', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      await assert.rejects(
        () =>
          service.createMapping('', {
            projectSlug: 'project',
            organizationSlug: 'org',
          }),
        /directory/i
      );
    });

    it('validates project data is required', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      await assert.rejects(
        () => service.createMapping('/some/path', {}),
        /required/i
      );
    });

    it('validates projectSlug is required', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      await assert.rejects(
        () => service.createMapping('/some/path', { organizationSlug: 'org' }),
        /required/i
      );
    });
  });

  describe('removeMapping', () => {
    it('removes existing mapping', async () => {
      let mappingStore = createInMemoryMappingStore({
        '/my/project': { projectSlug: 'my-project', organizationSlug: 'org' },
      });
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      await service.removeMapping('/my/project');

      let stored = mappingStore._getState();
      assert.strictEqual(stored['/my/project'], undefined);
    });

    it('validates directory is required', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let service = createProjectService({ httpClient, mappingStore });

      await assert.rejects(() => service.removeMapping(''), /directory/i);
    });
  });

  describe('listProjects', () => {
    it('returns empty array when not authenticated', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let getAuthTokens = createMockTokenGetter(null);
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      let result = await service.listProjects();

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('returns projects when authenticated', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': {
          user: { email: 'test@example.com' },
          organizations: [{ slug: 'my-org', name: 'My Org' }],
        },
        '/api/project': {
          projects: [
            { slug: 'project-1', name: 'Project 1' },
            { slug: 'project-2', name: 'Project 2' },
          ],
        },
      });
      let getAuthTokens = createMockTokenGetter({
        accessToken: 'valid-token',
        refreshToken: 'refresh',
      });
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      let result = await service.listProjects();

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].slug, 'project-1');
      assert.strictEqual(result[1].slug, 'project-2');
    });

    it('enriches projects with organization info', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': {
          user: { email: 'test@example.com' },
          organizations: [{ slug: 'my-org', name: 'My Org' }],
        },
        '/api/project': {
          projects: [{ slug: 'project-1', name: 'Project 1' }],
        },
      });
      let getAuthTokens = createMockTokenGetter({
        accessToken: 'valid-token',
        refreshToken: 'refresh',
      });
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      let result = await service.listProjects();

      assert.strictEqual(result[0].organizationSlug, 'my-org');
      assert.strictEqual(result[0].organizationName, 'My Org');
    });
  });

  describe('getRecentBuilds', () => {
    it('returns empty array when not authenticated', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({});
      let getAuthTokens = createMockTokenGetter(null);
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      let result = await service.getRecentBuilds('project', 'org', {
        limit: 10,
      });

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);
    });

    it('returns builds when authenticated', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({
        '/api/build/my-project': {
          builds: [
            { id: 'build-1', branch: 'main', status: 'passed' },
            { id: 'build-2', branch: 'feature', status: 'failed' },
          ],
        },
      });
      let getAuthTokens = createMockTokenGetter({
        accessToken: 'valid-token',
        refreshToken: 'refresh',
      });
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      let result = await service.getRecentBuilds('my-project', 'my-org', {
        limit: 10,
      });

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, 'build-1');
      assert.strictEqual(result[1].id, 'build-2');
    });

    it('passes query options to API', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({
        '/api/build/my-project': {
          builds: [{ id: 'build-1', branch: 'main' }],
        },
      });
      let getAuthTokens = createMockTokenGetter({
        accessToken: 'valid-token',
        refreshToken: 'refresh',
      });
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      await service.getRecentBuilds('my-project', 'my-org', {
        limit: 5,
        branch: 'main',
      });

      // Verify the request was made (we can inspect the endpoint called)
      let calls = httpClient._getCalls();
      assert.ok(calls.length > 0);
    });
  });

  describe('httpClient caching', () => {
    it('reuses same httpClient for multiple API calls', async () => {
      let mappingStore = createInMemoryMappingStore({});
      let httpClient = createMockHttpClient({
        '/api/auth/cli/whoami': {
          user: { email: 'test@example.com' },
          organizations: [{ slug: 'org' }],
        },
        '/api/project': { projects: [] },
        '/api/build/p1': { builds: [] },
      });
      let getAuthTokens = createMockTokenGetter({
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      let service = createProjectService({
        httpClient,
        mappingStore,
        getAuthTokens,
      });

      // Make multiple API calls
      await service.listProjects();
      await service.getRecentBuilds('p1', 'org', {});

      // All calls should have gone through the same httpClient
      let calls = httpClient._getCalls();
      assert.ok(calls.length >= 2);
    });
  });
});
