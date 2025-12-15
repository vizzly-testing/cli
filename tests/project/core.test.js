import assert from 'node:assert';
import { describe, it } from 'node:test';
import { VizzlyError } from '../../src/errors/vizzly-error.js';
import {
  buildBuildsQueryParams,
  buildBuildsUrl,
  buildMappingResult,
  buildNoApiServiceError,
  buildNoAuthError,
  buildOrgHeader,
  buildProjectFetchError,
  buildProjectUrl,
  buildTokenCreateError,
  buildTokenRevokeError,
  buildTokensFetchError,
  buildTokensUrl,
  enrichProjectsWithOrg,
  extractBuilds,
  extractOrganizations,
  extractProject,
  extractProjects,
  extractToken,
  extractTokens,
  mappingsToArray,
  validateDirectory,
  validateProjectData,
} from '../../src/project/core.js';

describe('project/core', () => {
  describe('validateDirectory', () => {
    it('returns valid for non-empty directory', () => {
      let result = validateDirectory('/path/to/project');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns error for empty directory', () => {
      let result = validateDirectory('');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error instanceof VizzlyError);
      assert.strictEqual(result.error.code, 'INVALID_DIRECTORY');
    });

    it('returns error for null directory', () => {
      let result = validateDirectory(null);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.message.includes('Directory path is required'));
    });

    it('returns error for undefined directory', () => {
      let result = validateDirectory(undefined);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('validateProjectData', () => {
    it('returns valid for complete project data', () => {
      let result = validateProjectData({
        projectSlug: 'my-project',
        organizationSlug: 'my-org',
        token: 'vzt_token_123',
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns error for missing projectSlug', () => {
      let result = validateProjectData({
        organizationSlug: 'my-org',
        token: 'vzt_token_123',
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error.code, 'INVALID_PROJECT_DATA');
      assert.ok(result.error.message.includes('Project slug is required'));
    });

    it('returns error for missing organizationSlug', () => {
      let result = validateProjectData({
        projectSlug: 'my-project',
        token: 'vzt_token_123',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.message.includes('Organization slug is required'));
    });

    it('returns error for missing token', () => {
      let result = validateProjectData({
        projectSlug: 'my-project',
        organizationSlug: 'my-org',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.message.includes('Project token is required'));
    });
  });

  describe('mappingsToArray', () => {
    it('converts empty object to empty array', () => {
      assert.deepStrictEqual(mappingsToArray({}), []);
    });

    it('converts mappings object to array with directory property', () => {
      let mappings = {
        '/path/to/project1': { projectSlug: 'proj1', token: 'tok1' },
        '/path/to/project2': { projectSlug: 'proj2', token: 'tok2' },
      };

      let result = mappingsToArray(mappings);

      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], {
        directory: '/path/to/project1',
        projectSlug: 'proj1',
        token: 'tok1',
      });
      assert.deepStrictEqual(result[1], {
        directory: '/path/to/project2',
        projectSlug: 'proj2',
        token: 'tok2',
      });
    });
  });

  describe('buildMappingResult', () => {
    it('builds mapping result with directory included', () => {
      let result = buildMappingResult('/my/path', {
        projectSlug: 'proj',
        token: 'tok',
      });

      assert.deepStrictEqual(result, {
        directory: '/my/path',
        projectSlug: 'proj',
        token: 'tok',
      });
    });
  });

  describe('buildBuildsQueryParams', () => {
    it('returns empty string for no options', () => {
      assert.strictEqual(buildBuildsQueryParams(), '');
      assert.strictEqual(buildBuildsQueryParams({}), '');
    });

    it('builds query string with limit', () => {
      assert.strictEqual(buildBuildsQueryParams({ limit: 10 }), '?limit=10');
    });

    it('builds query string with branch', () => {
      assert.strictEqual(
        buildBuildsQueryParams({ branch: 'main' }),
        '?branch=main'
      );
    });

    it('builds query string with both params', () => {
      let result = buildBuildsQueryParams({ limit: 5, branch: 'develop' });
      assert.ok(result.includes('limit=5'));
      assert.ok(result.includes('branch=develop'));
      assert.ok(result.includes('&'));
    });
  });

  describe('buildOrgHeader', () => {
    it('builds X-Organization header', () => {
      assert.deepStrictEqual(buildOrgHeader('my-org'), {
        'X-Organization': 'my-org',
      });
    });
  });

  describe('buildProjectUrl', () => {
    it('builds project API URL', () => {
      assert.strictEqual(
        buildProjectUrl('my-project'),
        '/api/project/my-project'
      );
    });
  });

  describe('buildBuildsUrl', () => {
    it('builds builds API URL without query params', () => {
      assert.strictEqual(buildBuildsUrl('my-project'), '/api/build/my-project');
    });

    it('builds builds API URL with query params', () => {
      assert.strictEqual(
        buildBuildsUrl('my-project', { limit: 5 }),
        '/api/build/my-project?limit=5'
      );
    });
  });

  describe('buildTokensUrl', () => {
    it('builds tokens API URL without token ID', () => {
      assert.strictEqual(
        buildTokensUrl('my-org', 'my-project'),
        '/api/cli/organizations/my-org/projects/my-project/tokens'
      );
    });

    it('builds tokens API URL with token ID', () => {
      assert.strictEqual(
        buildTokensUrl('my-org', 'my-project', 'tok_123'),
        '/api/cli/organizations/my-org/projects/my-project/tokens/tok_123'
      );
    });
  });

  describe('extractProjects', () => {
    it('extracts projects array from response', () => {
      let response = { projects: [{ id: 1 }, { id: 2 }] };
      assert.deepStrictEqual(extractProjects(response), [{ id: 1 }, { id: 2 }]);
    });

    it('returns empty array for missing projects', () => {
      assert.deepStrictEqual(extractProjects({}), []);
      assert.deepStrictEqual(extractProjects(null), []);
      assert.deepStrictEqual(extractProjects(undefined), []);
    });
  });

  describe('extractProject', () => {
    it('extracts project from response.project', () => {
      let response = { project: { id: 1, name: 'Test' } };
      assert.deepStrictEqual(extractProject(response), { id: 1, name: 'Test' });
    });

    it('returns response directly if no project field', () => {
      let response = { id: 1, name: 'Test' };
      assert.deepStrictEqual(extractProject(response), { id: 1, name: 'Test' });
    });
  });

  describe('extractBuilds', () => {
    it('extracts builds array from response', () => {
      let response = { builds: [{ id: 'b1' }, { id: 'b2' }] };
      assert.deepStrictEqual(extractBuilds(response), [
        { id: 'b1' },
        { id: 'b2' },
      ]);
    });

    it('returns empty array for missing builds', () => {
      assert.deepStrictEqual(extractBuilds({}), []);
    });
  });

  describe('extractToken', () => {
    it('extracts token from response', () => {
      let response = { token: { id: 't1', value: 'vzt_xxx' } };
      assert.deepStrictEqual(extractToken(response), {
        id: 't1',
        value: 'vzt_xxx',
      });
    });

    it('returns undefined for missing token', () => {
      assert.strictEqual(extractToken({}), undefined);
    });
  });

  describe('extractTokens', () => {
    it('extracts tokens array from response', () => {
      let response = { tokens: [{ id: 't1' }, { id: 't2' }] };
      assert.deepStrictEqual(extractTokens(response), [
        { id: 't1' },
        { id: 't2' },
      ]);
    });

    it('returns empty array for missing tokens', () => {
      assert.deepStrictEqual(extractTokens({}), []);
    });
  });

  describe('enrichProjectsWithOrg', () => {
    it('adds organization info to each project', () => {
      let projects = [{ id: 'p1', name: 'Project 1' }];
      let org = { slug: 'my-org', name: 'My Org' };

      let result = enrichProjectsWithOrg(projects, org);

      assert.deepStrictEqual(result, [
        {
          id: 'p1',
          name: 'Project 1',
          organizationSlug: 'my-org',
          organizationName: 'My Org',
        },
      ]);
    });

    it('handles empty projects array', () => {
      assert.deepStrictEqual(
        enrichProjectsWithOrg([], { slug: 'org', name: 'Org' }),
        []
      );
    });
  });

  describe('extractOrganizations', () => {
    it('extracts organizations from whoami response', () => {
      let response = { organizations: [{ id: 'o1' }, { id: 'o2' }] };
      assert.deepStrictEqual(extractOrganizations(response), [
        { id: 'o1' },
        { id: 'o2' },
      ]);
    });

    it('returns empty array for missing organizations', () => {
      assert.deepStrictEqual(extractOrganizations({}), []);
      assert.deepStrictEqual(extractOrganizations(null), []);
    });
  });

  describe('error builders', () => {
    it('buildProjectFetchError wraps original error', () => {
      let original = new Error('Network failed');
      let error = buildProjectFetchError(original);

      assert.ok(error instanceof VizzlyError);
      assert.strictEqual(error.code, 'PROJECT_FETCH_FAILED');
      assert.ok(error.message.includes('Network failed'));
    });

    it('buildNoAuthError creates no auth error', () => {
      let error = buildNoAuthError();
      assert.strictEqual(error.code, 'NO_AUTH_SERVICE');
      assert.ok(error.message.includes('No authentication available'));
    });

    it('buildNoApiServiceError creates no API service error', () => {
      let error = buildNoApiServiceError();
      assert.strictEqual(error.code, 'NO_API_SERVICE');
      assert.ok(error.message.includes('API service not available'));
    });

    it('buildTokenCreateError wraps original error', () => {
      let original = new Error('Token create failed');
      let error = buildTokenCreateError(original);

      assert.strictEqual(error.code, 'TOKEN_CREATE_FAILED');
      assert.ok(error.message.includes('Token create failed'));
    });

    it('buildTokensFetchError wraps original error', () => {
      let original = new Error('Fetch failed');
      let error = buildTokensFetchError(original);

      assert.strictEqual(error.code, 'TOKENS_FETCH_FAILED');
    });

    it('buildTokenRevokeError wraps original error', () => {
      let original = new Error('Revoke failed');
      let error = buildTokenRevokeError(original);

      assert.strictEqual(error.code, 'TOKEN_REVOKE_FAILED');
    });
  });
});
