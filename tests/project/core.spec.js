import { describe, expect, it } from 'vitest';
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
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns error for empty directory', () => {
      let result = validateDirectory('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(VizzlyError);
      expect(result.error.code).toBe('INVALID_DIRECTORY');
    });

    it('returns error for null directory', () => {
      let result = validateDirectory(null);
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain('Directory path is required');
    });

    it('returns error for undefined directory', () => {
      let result = validateDirectory(undefined);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateProjectData', () => {
    it('returns valid for complete project data', () => {
      let result = validateProjectData({
        projectSlug: 'my-project',
        organizationSlug: 'my-org',
        token: 'vzt_token_123',
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns error for missing projectSlug', () => {
      let result = validateProjectData({
        organizationSlug: 'my-org',
        token: 'vzt_token_123',
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe('INVALID_PROJECT_DATA');
      expect(result.error.message).toContain('Project slug is required');
    });

    it('returns error for missing organizationSlug', () => {
      let result = validateProjectData({
        projectSlug: 'my-project',
        token: 'vzt_token_123',
      });
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain('Organization slug is required');
    });

    it('returns error for missing token', () => {
      let result = validateProjectData({
        projectSlug: 'my-project',
        organizationSlug: 'my-org',
      });
      expect(result.valid).toBe(false);
      expect(result.error.message).toContain('Project token is required');
    });
  });

  describe('mappingsToArray', () => {
    it('converts empty object to empty array', () => {
      expect(mappingsToArray({})).toEqual([]);
    });

    it('converts mappings object to array with directory property', () => {
      let mappings = {
        '/path/to/project1': { projectSlug: 'proj1', token: 'tok1' },
        '/path/to/project2': { projectSlug: 'proj2', token: 'tok2' },
      };

      let result = mappingsToArray(mappings);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        directory: '/path/to/project1',
        projectSlug: 'proj1',
        token: 'tok1',
      });
      expect(result[1]).toEqual({
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

      expect(result).toEqual({
        directory: '/my/path',
        projectSlug: 'proj',
        token: 'tok',
      });
    });
  });

  describe('buildBuildsQueryParams', () => {
    it('returns empty string for no options', () => {
      expect(buildBuildsQueryParams()).toBe('');
      expect(buildBuildsQueryParams({})).toBe('');
    });

    it('builds query string with limit', () => {
      expect(buildBuildsQueryParams({ limit: 10 })).toBe('?limit=10');
    });

    it('builds query string with branch', () => {
      expect(buildBuildsQueryParams({ branch: 'main' })).toBe('?branch=main');
    });

    it('builds query string with both params', () => {
      let result = buildBuildsQueryParams({ limit: 5, branch: 'develop' });
      expect(result).toContain('limit=5');
      expect(result).toContain('branch=develop');
      expect(result).toContain('&');
    });
  });

  describe('buildOrgHeader', () => {
    it('builds X-Organization header', () => {
      expect(buildOrgHeader('my-org')).toEqual({
        'X-Organization': 'my-org',
      });
    });
  });

  describe('buildProjectUrl', () => {
    it('builds project API URL', () => {
      expect(buildProjectUrl('my-project')).toBe('/api/project/my-project');
    });
  });

  describe('buildBuildsUrl', () => {
    it('builds builds API URL without query params', () => {
      expect(buildBuildsUrl('my-project')).toBe('/api/build/my-project');
    });

    it('builds builds API URL with query params', () => {
      expect(buildBuildsUrl('my-project', { limit: 5 })).toBe(
        '/api/build/my-project?limit=5'
      );
    });
  });

  describe('buildTokensUrl', () => {
    it('builds tokens API URL without token ID', () => {
      expect(buildTokensUrl('my-org', 'my-project')).toBe(
        '/api/cli/organizations/my-org/projects/my-project/tokens'
      );
    });

    it('builds tokens API URL with token ID', () => {
      expect(buildTokensUrl('my-org', 'my-project', 'tok_123')).toBe(
        '/api/cli/organizations/my-org/projects/my-project/tokens/tok_123'
      );
    });
  });

  describe('extractProjects', () => {
    it('extracts projects array from response', () => {
      let response = { projects: [{ id: 1 }, { id: 2 }] };
      expect(extractProjects(response)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('returns empty array for missing projects', () => {
      expect(extractProjects({})).toEqual([]);
      expect(extractProjects(null)).toEqual([]);
      expect(extractProjects(undefined)).toEqual([]);
    });
  });

  describe('extractProject', () => {
    it('extracts project from response.project', () => {
      let response = { project: { id: 1, name: 'Test' } };
      expect(extractProject(response)).toEqual({ id: 1, name: 'Test' });
    });

    it('returns response directly if no project field', () => {
      let response = { id: 1, name: 'Test' };
      expect(extractProject(response)).toEqual({ id: 1, name: 'Test' });
    });
  });

  describe('extractBuilds', () => {
    it('extracts builds array from response', () => {
      let response = { builds: [{ id: 'b1' }, { id: 'b2' }] };
      expect(extractBuilds(response)).toEqual([{ id: 'b1' }, { id: 'b2' }]);
    });

    it('returns empty array for missing builds', () => {
      expect(extractBuilds({})).toEqual([]);
    });
  });

  describe('extractToken', () => {
    it('extracts token from response', () => {
      let response = { token: { id: 't1', value: 'vzt_xxx' } };
      expect(extractToken(response)).toEqual({ id: 't1', value: 'vzt_xxx' });
    });

    it('returns undefined for missing token', () => {
      expect(extractToken({})).toBeUndefined();
    });
  });

  describe('extractTokens', () => {
    it('extracts tokens array from response', () => {
      let response = { tokens: [{ id: 't1' }, { id: 't2' }] };
      expect(extractTokens(response)).toEqual([{ id: 't1' }, { id: 't2' }]);
    });

    it('returns empty array for missing tokens', () => {
      expect(extractTokens({})).toEqual([]);
    });
  });

  describe('enrichProjectsWithOrg', () => {
    it('adds organization info to each project', () => {
      let projects = [{ id: 'p1', name: 'Project 1' }];
      let org = { slug: 'my-org', name: 'My Org' };

      let result = enrichProjectsWithOrg(projects, org);

      expect(result).toEqual([
        {
          id: 'p1',
          name: 'Project 1',
          organizationSlug: 'my-org',
          organizationName: 'My Org',
        },
      ]);
    });

    it('handles empty projects array', () => {
      expect(enrichProjectsWithOrg([], { slug: 'org', name: 'Org' })).toEqual(
        []
      );
    });
  });

  describe('extractOrganizations', () => {
    it('extracts organizations from whoami response', () => {
      let response = { organizations: [{ id: 'o1' }, { id: 'o2' }] };
      expect(extractOrganizations(response)).toEqual([
        { id: 'o1' },
        { id: 'o2' },
      ]);
    });

    it('returns empty array for missing organizations', () => {
      expect(extractOrganizations({})).toEqual([]);
      expect(extractOrganizations(null)).toEqual([]);
    });
  });

  describe('error builders', () => {
    it('buildProjectFetchError wraps original error', () => {
      let original = new Error('Network failed');
      let error = buildProjectFetchError(original);

      expect(error).toBeInstanceOf(VizzlyError);
      expect(error.code).toBe('PROJECT_FETCH_FAILED');
      expect(error.message).toContain('Network failed');
    });

    it('buildNoAuthError creates no auth error', () => {
      let error = buildNoAuthError();
      expect(error.code).toBe('NO_AUTH_SERVICE');
      expect(error.message).toContain('No authentication available');
    });

    it('buildNoApiServiceError creates no API service error', () => {
      let error = buildNoApiServiceError();
      expect(error.code).toBe('NO_API_SERVICE');
      expect(error.message).toContain('API service not available');
    });

    it('buildTokenCreateError wraps original error', () => {
      let original = new Error('Token create failed');
      let error = buildTokenCreateError(original);

      expect(error.code).toBe('TOKEN_CREATE_FAILED');
      expect(error.message).toContain('Token create failed');
    });

    it('buildTokensFetchError wraps original error', () => {
      let original = new Error('Fetch failed');
      let error = buildTokensFetchError(original);

      expect(error.code).toBe('TOKENS_FETCH_FAILED');
    });

    it('buildTokenRevokeError wraps original error', () => {
      let original = new Error('Revoke failed');
      let error = buildTokenRevokeError(original);

      expect(error.code).toBe('TOKEN_REVOKE_FAILED');
    });
  });
});
