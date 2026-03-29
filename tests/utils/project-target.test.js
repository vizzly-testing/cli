import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  isProjectToken,
  normalizeTarget,
  resolveProjectTarget,
  resolveTargetFromSources,
  validateTargetOptions,
} from '../../src/utils/project-target.js';

describe('utils/project-target', () => {
  describe('isProjectToken', () => {
    it('detects project tokens by prefix', () => {
      assert.strictEqual(isProjectToken('vzt_123'), true);
      assert.strictEqual(isProjectToken('user-token'), false);
      assert.strictEqual(isProjectToken(null), false);
    });
  });

  describe('validateTargetOptions', () => {
    it('accepts --project-id on its own', () => {
      let errors = validateTargetOptions({ projectId: 'proj_123' });
      assert.deepStrictEqual(errors, []);
    });

    it('accepts --org with --project', () => {
      let errors = validateTargetOptions({
        org: 'acme',
        project: 'marketing-site',
      });
      assert.deepStrictEqual(errors, []);
    });

    it('rejects --project without --org', () => {
      let errors = validateTargetOptions({ project: 'marketing-site' });
      assert.deepStrictEqual(errors, [
        '--project requires --org. Pass both --org and --project, or use --project-id.',
      ]);
    });

    it('rejects --org without --project', () => {
      let errors = validateTargetOptions({ org: 'acme' });
      assert.deepStrictEqual(errors, [
        '--org requires --project. Pass both --org and --project, or use --project-id.',
      ]);
    });
  });

  describe('normalizeTarget', () => {
    it('normalizes project id targets', () => {
      assert.deepStrictEqual(normalizeTarget({ projectId: 'proj_123' }), {
        projectId: 'proj_123',
      });
    });

    it('normalizes slug targets from nested token context', () => {
      assert.deepStrictEqual(
        normalizeTarget({
          organization: { slug: 'acme' },
          project: { slug: 'marketing-site' },
        }),
        {
          organizationSlug: 'acme',
          projectSlug: 'marketing-site',
        }
      );
    });
  });

  describe('resolveTargetFromSources', () => {
    it('prefers --project-id over every other source', () => {
      let result = resolveTargetFromSources({
        options: {
          projectId: 'proj_from_flag',
          org: 'flag-org',
          project: 'flag-project',
        },
        configTarget: {
          organizationSlug: 'config-org',
          projectSlug: 'config-project',
        },
        tokenContext: {
          organization: { slug: 'token-org' },
          project: { slug: 'token-project' },
        },
      });

      assert.deepStrictEqual(result, {
        source: 'flag:project-id',
        target: { projectId: 'proj_from_flag' },
      });
    });

    it('prefers explicit slug flags over config', () => {
      let result = resolveTargetFromSources({
        options: { org: 'flag-org', project: 'flag-project' },
        configTarget: {
          organizationSlug: 'config-org',
          projectSlug: 'config-project',
        },
      });

      assert.deepStrictEqual(result, {
        source: 'flag:slug',
        target: {
          organizationSlug: 'flag-org',
          projectSlug: 'flag-project',
        },
      });
    });

    it('falls back to config target', () => {
      let result = resolveTargetFromSources({
        configTarget: {
          organizationSlug: 'config-org',
          projectSlug: 'config-project',
        },
      });

      assert.deepStrictEqual(result, {
        source: 'config',
        target: {
          organizationSlug: 'config-org',
          projectSlug: 'config-project',
        },
      });
    });

    it('falls back to token context', () => {
      let result = resolveTargetFromSources({
        tokenContext: {
          organization: { slug: 'token-org' },
          project: { slug: 'token-project' },
        },
      });

      assert.deepStrictEqual(result, {
        source: 'token-context',
        target: {
          organizationSlug: 'token-org',
          projectSlug: 'token-project',
        },
      });
    });
  });

  describe('resolveProjectTarget', () => {
    it('returns config target without calling token context', async () => {
      let called = false;

      let result = await resolveProjectTarget({
        command: 'run',
        config: {
          apiKey: 'user-token',
          target: {
            organizationSlug: 'acme',
            projectSlug: 'marketing-site',
          },
        },
        createApiClient: () => {
          called = true;
          return {};
        },
        getTokenContext: async () => {
          called = true;
          return {};
        },
      });

      assert.strictEqual(called, false);
      assert.deepStrictEqual(result, {
        source: 'config',
        target: {
          organizationSlug: 'acme',
          projectSlug: 'marketing-site',
        },
      });
    });

    it('treats project tokens as their own target context', async () => {
      let result = await resolveProjectTarget({
        command: 'upload',
        config: {
          apiKey: 'vzt_project_token',
          apiUrl: 'https://app.vizzly.dev/api',
        },
      });

      assert.deepStrictEqual(result, {
        source: 'project-token',
        target: null,
      });
    });

    it('returns null when target is optional and nothing resolves', async () => {
      let result = await resolveProjectTarget({
        command: 'preview',
        config: { apiKey: 'user-token' },
        requireTarget: false,
      });

      assert.strictEqual(result, null);
    });

    it('throws a clear error when target is required and missing', async () => {
      await assert.rejects(
        () =>
          resolveProjectTarget({
            command: 'run',
            config: { apiKey: 'user-token' },
          }),
        error => {
          assert.strictEqual(error.code, 'VALIDATION_ERROR');
          assert.ok(
            error.message.includes('This command needs a target project')
          );
          return true;
        }
      );
    });
  });
});
