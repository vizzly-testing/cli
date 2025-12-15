import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { createProjectsRouter } from '../../../src/server/routers/projects.js';

/**
 * Creates a mock HTTP request with body support
 */
function createMockRequest(method = 'GET', body = null) {
  let emitter = new EventEmitter();
  emitter.method = method;

  if (body !== null) {
    process.nextTick(() => {
      emitter.emit('data', JSON.stringify(body));
      emitter.emit('end');
    });
  }

  return emitter;
}

/**
 * Creates a mock HTTP response with tracking
 */
function createMockResponse() {
  let headers = {};
  let statusCode = null;
  let body = null;

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    end(content) {
      body = content;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    getParsedBody() {
      return body ? JSON.parse(body) : null;
    },
  };
}

/**
 * Creates a mock URL object
 */
function createMockUrl(params = {}) {
  return {
    searchParams: {
      get: key => params[key] || null,
    },
  };
}

/**
 * Creates a mock project service
 */
function createMockProjectService(options = {}) {
  return {
    listProjects: async () => {
      if (options.listError) throw options.listError;
      return options.projects || [{ slug: 'project-1' }, { slug: 'project-2' }];
    },
    listMappings: async () => {
      if (options.listMappingsError) throw options.listMappingsError;
      return options.mappings || { '/project': { projectSlug: 'proj' } };
    },
    createMapping: async (directory, data) => {
      if (options.createMappingError) throw options.createMappingError;
      return { directory, ...data };
    },
    removeMapping: async _directory => {
      if (options.removeMappingError) throw options.removeMappingError;
    },
    getMapping: async _directory => {
      if (options.getMappingError) throw options.getMappingError;
      return options.mapping || null;
    },
    getRecentBuilds: async (_projectSlug, _orgSlug, _filters) => {
      if (options.getBuildsError) throw options.getBuildsError;
      return (
        options.builds || [
          { id: 'build-1', status: 'completed' },
          { id: 'build-2', status: 'running' },
        ]
      );
    },
  };
}

describe('server/routers/projects', () => {
  describe('createProjectsRouter', () => {
    it('returns false for unmatched paths', async () => {
      let handler = createProjectsRouter({
        projectService: createMockProjectService(),
      });
      let req = createMockRequest('GET');
      let res = createMockResponse();
      let url = createMockUrl();

      let result = await handler(req, res, '/other', url);

      assert.strictEqual(result, false);
    });

    it('returns 503 when projectService is unavailable for project paths', async () => {
      let handler = createProjectsRouter({ projectService: null });
      let req = createMockRequest('GET');
      let res = createMockResponse();
      let url = createMockUrl();

      let result = await handler(req, res, '/api/projects', url);

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 503);
    });

    describe('GET /api/projects', () => {
      it('lists projects', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            projects: [{ slug: 'proj-a' }, { slug: 'proj-b' }],
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.projects.length, 2);
        assert.strictEqual(body.projects[0].slug, 'proj-a');
      });

      it('returns 500 on error', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            listError: new Error('List failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('GET /api/projects/mappings', () => {
      it('lists project mappings', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            mappings: { '/dir': { projectSlug: 'proj' } },
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/mappings', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.ok(body.mappings['/dir']);
      });

      it('returns 500 on error', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            listMappingsError: new Error('Mappings failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/mappings', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('POST /api/projects/mappings', () => {
      it('creates project mapping', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService(),
        });
        let req = createMockRequest('POST', {
          directory: '/my-project',
          projectSlug: 'proj',
          organizationSlug: 'org',
          token: 'vzt_123',
        });
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/mappings', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.mapping.directory, '/my-project');
      });

      it('returns 500 on error', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            createMappingError: new Error('Create failed'),
          }),
        });
        let req = createMockRequest('POST', { directory: '/proj' });
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/mappings', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('DELETE /api/projects/mappings/:directory', () => {
      it('deletes project mapping', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService(),
        });
        let req = createMockRequest('DELETE');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/mappings/%2Fmy-project', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.success, true);
      });

      it('returns 500 on error', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            removeMappingError: new Error('Remove failed'),
          }),
        });
        let req = createMockRequest('DELETE');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/mappings/%2Fproj', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('GET /api/builds/recent', () => {
      it('returns 503 when projectService is unavailable', async () => {
        let handler = createProjectsRouter({ projectService: null });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/builds/recent', url);

        assert.strictEqual(res.statusCode, 503);
      });

      it('returns 400 when no project mapping exists', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({ mapping: null }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/builds/recent', url);

        assert.strictEqual(res.statusCode, 400);
        let body = res.getParsedBody();
        assert.ok(body.error.includes('No project configured'));
      });

      it('returns recent builds', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            mapping: { projectSlug: 'proj', organizationSlug: 'org' },
            builds: [{ id: 'b1' }, { id: 'b2' }],
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl({ limit: '5', branch: 'main' });

        await handler(req, res, '/api/builds/recent', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.builds.length, 2);
      });

      it('returns 500 on error', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            mapping: { projectSlug: 'proj', organizationSlug: 'org' },
            getBuildsError: new Error('Builds failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/builds/recent', url);

        assert.strictEqual(res.statusCode, 500);
      });
    });

    describe('GET /api/projects/:org/:project/builds', () => {
      it('returns builds for specific project', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            builds: [{ id: 'build-a' }],
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl({ limit: '10' });

        await handler(req, res, '/api/projects/my-org/my-project/builds', url);

        assert.strictEqual(res.statusCode, 200);
        let body = res.getParsedBody();
        assert.strictEqual(body.builds.length, 1);
      });

      it('returns 500 on error', async () => {
        let handler = createProjectsRouter({
          projectService: createMockProjectService({
            getBuildsError: new Error('Fetch failed'),
          }),
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(req, res, '/api/projects/org/proj/builds', url);

        assert.strictEqual(res.statusCode, 500);
      });

      it('handles URL-encoded org and project slugs', async () => {
        let capturedArgs = {};
        let handler = createProjectsRouter({
          projectService: {
            ...createMockProjectService(),
            getRecentBuilds: async (projectSlug, orgSlug) => {
              capturedArgs = { projectSlug, orgSlug };
              return [];
            },
          },
        });
        let req = createMockRequest('GET');
        let res = createMockResponse();
        let url = createMockUrl();

        await handler(
          req,
          res,
          '/api/projects/my%20org/my%20project/builds',
          url
        );

        assert.strictEqual(capturedArgs.projectSlug, 'my project');
        assert.strictEqual(capturedArgs.orgSlug, 'my org');
      });
    });
  });
});
