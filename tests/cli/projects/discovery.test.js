import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { findJSONMessage, runCLI } from '../../helpers/cli-runner.js';
import { createCloudServer } from '../../helpers/cloud-server.js';

let projects = [
  {
    id: 'project-1',
    name: 'Frontend',
    slug: 'frontend',
    organizationName: 'Vizzly',
    organizationSlug: 'vizzly',
    buildCount: 100,
    created_at: '2026-01-01',
    updated_at: '2026-06-01',
  },
  {
    id: 'project-2',
    name: 'Dashboard',
    slug: 'dashboard',
    organizationName: 'PitStop',
    organizationSlug: 'pitstop',
    buildCount: 50,
    created_at: '2026-02-01',
    updated_at: '2026-06-01',
  },
];

let organizations = [
  {
    id: 'org-1',
    name: 'Vizzly',
    slug: 'vizzly',
    role: 'owner',
    projectCount: 11,
    created_at: '2026-01-01',
  },
  {
    id: 'org-2',
    name: 'PitStop',
    slug: 'pitstop',
    role: 'token',
    projectCount: 3,
    created_at: '2026-02-01',
  },
];

async function createWorkspace(t, { config, accessToken } = {}) {
  let cwd = await mkdtemp(path.join(tmpdir(), 'vizzly-project-discovery-'));
  let home = path.join(cwd, '.vizzly-home');
  await mkdir(home, { recursive: true });

  if (config) {
    await writeFile(
      path.join(cwd, 'vizzly.config.js'),
      `export default ${JSON.stringify(config)};\n`
    );
  }
  if (accessToken) {
    await writeFile(
      path.join(home, 'config.json'),
      JSON.stringify({
        auth: { accessToken, expiresAt: '2999-01-01T00:00:00.000Z' },
      })
    );
  }

  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, home };
}

async function runDiscoveryCLI(workspace, apiUrl, args, env = {}) {
  return runCLI(['--no-color', ...args], {
    cwd: workspace.cwd,
    env: {
      VIZZLY_HOME: workspace.home,
      VIZZLY_API_URL: apiUrl,
      ...env,
    },
  });
}

function jsonData(result) {
  return findJSONMessage(result.stdout, 'data')?.data;
}

describe('organization and project discovery CLI', () => {
  it('uses saved user auth over environment and project credentials and returns JSON data', async t => {
    let { client, requests } = await createCloudServer(t, ({ url }) => {
      if (url.startsWith('/api/sdk/projects')) {
        return {
          body: {
            projects,
            pagination: { total: 8, hasMore: true },
          },
        };
      }
      return { body: { organizations } };
    });
    let workspace = await createWorkspace(t, {
      config: { apiKey: 'vzt_project_credential' },
      accessToken: 'saved-user-credential',
    });

    let projectsResult = await runDiscoveryCLI(
      workspace,
      client.getBaseUrl(),
      [
        '--json',
        'projects',
        '--org',
        'pitstop',
        '--limit',
        '2',
        '--offset',
        '1',
      ],
      { VIZZLY_TOKEN: 'vzt_environment_credential' }
    );
    let orgsResult = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      '--json',
      'orgs',
    ]);

    assert.equal(projectsResult.code, 0, projectsResult.stderr);
    assert.equal(orgsResult.code, 0, orgsResult.stderr);
    assert.deepEqual(
      requests.map(request => request.headers.authorization),
      ['Bearer saved-user-credential', 'Bearer saved-user-credential']
    );
    assert.equal(
      requests[0].url,
      '/api/sdk/projects?organization=pitstop&limit=2&offset=1'
    );
    assert.deepEqual(jsonData(projectsResult), {
      projects: [
        {
          id: 'project-1',
          name: 'Frontend',
          slug: 'frontend',
          organizationName: 'Vizzly',
          organizationSlug: 'vizzly',
          buildCount: 100,
          createdAt: '2026-01-01',
          updatedAt: '2026-06-01',
        },
        {
          id: 'project-2',
          name: 'Dashboard',
          slug: 'dashboard',
          organizationName: 'PitStop',
          organizationSlug: 'pitstop',
          buildCount: 50,
          createdAt: '2026-02-01',
          updatedAt: '2026-06-01',
        },
      ],
      pagination: { total: 8, hasMore: true },
    });
    assert.deepEqual(jsonData(orgsResult), {
      organizations: [
        {
          id: 'org-1',
          name: 'Vizzly',
          slug: 'vizzly',
          role: 'owner',
          projectCount: 11,
          createdAt: '2026-01-01',
        },
        {
          id: 'org-2',
          name: 'PitStop',
          slug: 'pitstop',
          role: 'token',
          projectCount: 3,
          createdAt: '2026-02-01',
        },
      ],
      count: 2,
    });
  });

  it('falls back to a configured API key and exits when no credential exists', async t => {
    let { client, requests } = await createCloudServer(t, ({ url }) => ({
      body: url.includes('/projects')
        ? { projects, pagination: { total: 2, hasMore: false } }
        : { organizations },
    }));
    let fallbackWorkspace = await createWorkspace(t, {
      config: { apiKey: 'vzt_fallback_credential' },
    });

    let fallbackResult = await runDiscoveryCLI(
      fallbackWorkspace,
      client.getBaseUrl(),
      ['--json', 'projects']
    );

    assert.equal(fallbackResult.code, 0, fallbackResult.stderr);
    assert.equal(
      requests[0].headers.authorization,
      'Bearer vzt_fallback_credential'
    );

    let noAuthWorkspace = await createWorkspace(t);
    let noAuthResult = await runDiscoveryCLI(
      noAuthWorkspace,
      client.getBaseUrl(),
      ['orgs']
    );

    assert.equal(noAuthResult.code, 1);
    assert.match(
      `${noAuthResult.stdout}\n${noAuthResult.stderr}`,
      /API token required/
    );
    assert.equal(requests.length, 1);
  });

  it('shows names, counts, token role, and the next project page in human output', async t => {
    let { client } = await createCloudServer(t, ({ url }) => ({
      body: url.includes('/projects')
        ? { projects, pagination: { total: 8, hasMore: true } }
        : { organizations },
    }));
    let workspace = await createWorkspace(t, {
      accessToken: 'saved-user-credential',
    });

    let projectsResult = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      'projects',
    ]);
    let orgsResult = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      'orgs',
    ]);

    assert.equal(projectsResult.code, 0, projectsResult.stderr);
    assert.match(projectsResult.stdout, /Frontend/);
    assert.match(projectsResult.stdout, /Dashboard/);
    assert.match(projectsResult.stdout, /Showing:\s+2 of 8/);
    assert.match(projectsResult.stdout, /--offset 2/);
    assert.equal(orgsResult.code, 0, orgsResult.stderr);
    assert.match(orgsResult.stdout, /Vizzly/);
    assert.match(orgsResult.stdout, /PitStop/);
    assert.match(orgsResult.stdout, /Count:\s+2/);
    assert.match(orgsResult.stdout, /via token/);
  });

  it('reports empty project and organization lists clearly', async t => {
    let { client } = await createCloudServer(t, ({ url }) => ({
      body: url.includes('/projects')
        ? { projects: [], pagination: { total: 0, hasMore: false } }
        : { organizations: [] },
    }));
    let workspace = await createWorkspace(t, {
      accessToken: 'saved-user-credential',
    });

    let projectsResult = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      'projects',
    ]);
    let orgsResult = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      'orgs',
    ]);

    assert.equal(projectsResult.code, 0, projectsResult.stderr);
    assert.match(projectsResult.stdout, /No projects found/);
    assert.equal(orgsResult.code, 0, orgsResult.stderr);
    assert.match(orgsResult.stdout, /No organizations found/);
  });
});
