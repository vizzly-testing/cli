import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createProjectsRouter } from '../../../src/server/routers/projects.js';
import {
  createMockRequest,
  createMockResponse,
} from '../../helpers/http-mocks.js';

function createMockUrl(params = {}) {
  return {
    searchParams: {
      get: key => params[key] ?? null,
    },
  };
}

describe('server/routers/projects', () => {
  describe('createProjectsRouter', () => {
    it('returns projects from the project service', async () => {
      let handler = createProjectsRouter({
        projectService: {
          listProjects: async () => [{ slug: 'web' }],
        },
      });
      let req = createMockRequest();
      let res = createMockResponse();

      let result = await handler(req, res, '/api/projects', createMockUrl());

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.getParsedBody(), {
        projects: [{ slug: 'web' }],
      });
    });

    it('passes validated build filters to the project service', async () => {
      let captured = null;
      let handler = createProjectsRouter({
        projectService: {
          getRecentBuilds: async (projectSlug, organizationSlug, filters) => {
            captured = { projectSlug, organizationSlug, filters };
            return [{ id: 'build-1' }];
          },
        },
      });
      let req = createMockRequest();
      let res = createMockResponse();
      let url = createMockUrl({ limit: '5', branch: 'feature/test' });

      let result = await handler(
        req,
        res,
        '/api/projects/acme/web/builds',
        url
      );

      assert.strictEqual(result, true);
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(captured, {
        projectSlug: 'web',
        organizationSlug: 'acme',
        filters: { limit: 5, branch: 'feature/test' },
      });
      assert.deepStrictEqual(res.getParsedBody(), {
        builds: [{ id: 'build-1' }],
      });
    });

    it('defaults build limit when omitted', async () => {
      let capturedFilters = null;
      let handler = createProjectsRouter({
        projectService: {
          getRecentBuilds: async (_projectSlug, _organizationSlug, filters) => {
            capturedFilters = filters;
            return [];
          },
        },
      });
      let req = createMockRequest();
      let res = createMockResponse();

      await handler(req, res, '/api/projects/acme/web/builds', createMockUrl());

      assert.deepStrictEqual(capturedFilters, {
        limit: 20,
        branch: undefined,
      });
    });

    it('rejects malformed project build limits', async () => {
      let called = false;
      let handler = createProjectsRouter({
        projectService: {
          getRecentBuilds: async () => {
            called = true;
            return [];
          },
        },
      });
      let req = createMockRequest();
      let res = createMockResponse();

      let result = await handler(
        req,
        res,
        '/api/projects/acme/web/builds',
        createMockUrl({ limit: '10abc' })
      );

      assert.strictEqual(result, true);
      assert.strictEqual(called, false);
      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.getParsedBody(), {
        error: 'limit must be a positive integer',
      });
    });
  });
});
