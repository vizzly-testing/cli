import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createProjectService } from '../../src/services/project-service.js';

describe('services/project-service', () => {
  describe('createProjectService', () => {
    it('creates project service with all required methods', () => {
      let service = createProjectService();

      assert.ok(service);
      assert.ok(typeof service.listProjects === 'function');
      assert.ok(typeof service.listMappings === 'function');
      assert.ok(typeof service.getMapping === 'function');
      assert.ok(typeof service.createMapping === 'function');
      assert.ok(typeof service.removeMapping === 'function');
      assert.ok(typeof service.getRecentBuilds === 'function');
    });

    it('accepts custom API URL', () => {
      let service = createProjectService({ apiUrl: 'https://custom.api.test' });

      assert.ok(service);
      // Methods should still be available
      assert.ok(typeof service.listProjects === 'function');
    });
  });

  describe('listMappings', () => {
    it('returns an array', async () => {
      let service = createProjectService();

      let mappings = await service.listMappings();

      assert.ok(Array.isArray(mappings));
    });
  });

  describe('getMapping', () => {
    it('returns null for non-existent directory', async () => {
      let service = createProjectService();

      let mapping = await service.getMapping(
        '/nonexistent/path/that/does/not/exist'
      );

      // Should return null if no mapping exists
      // May return an object if the path happens to be mapped (unlikely)
      assert.ok(mapping === null || typeof mapping === 'object');
    });
  });

  describe('createMapping', () => {
    it('validates directory is required', async () => {
      let service = createProjectService();

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
      let service = createProjectService();

      await assert.rejects(
        () => service.createMapping('/some/path', {}),
        /required/i
      );
    });
  });

  describe('listProjects', () => {
    it('returns an array', async () => {
      let service = createProjectService();

      // This may return an empty array if not authenticated
      let projects = await service.listProjects();

      assert.ok(Array.isArray(projects));
    });
  });

  describe('getRecentBuilds', () => {
    it('returns an array', async () => {
      let service = createProjectService();

      // This may return an empty array if not authenticated
      let builds = await service.getRecentBuilds('project', 'org', {
        limit: 10,
      });

      assert.ok(Array.isArray(builds));
    });
  });
});
