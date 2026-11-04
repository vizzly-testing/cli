import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { saveFixtureAuth } from '../../helpers/auth-session.js';
import { runCLI } from '../../helpers/cli-runner.js';
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

async function createWorkspace(t, { config, accessToken, apiUrl } = {}) {
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
    await saveFixtureAuth(home, apiUrl, { accessToken });
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

describe('organization and project discovery CLI', () => {
  it('shows names, available counts, token role, and the next project page', async t => {
    let { client } = await createCloudServer(t, ({ url }) => {
      let query = new URL(url, 'http://fixture').searchParams;
      let isProjects = url.includes('/projects');
      return {
        body: {
          ...(isProjects ? { projects } : { organizations }),
          meta: {
            total: isProjects ? 8 : 2,
            limit: Number(query.get('limit')),
            offset: Number(query.get('offset')),
            hasMore: isProjects,
          },
        },
      };
    });
    let workspace = await createWorkspace(t, {
      accessToken: 'saved-user-credential',
      apiUrl: client.getBaseUrl(),
    });
    let result = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      'projects',
      '--limit',
      '2',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Name\s+Project\s+Organization\s+Builds/);
    assert.match(result.stdout, /Frontend\s+vizzly\/frontend\s+Vizzly\s+100/);
    assert.match(result.stdout, /Credential:\s+saved user login/);
    assert.doesNotMatch(result.stdout, /Permissions:/);
    assert.match(result.stdout, /Dashboard/);
    assert.match(result.stdout, /Showing:\s+2 of 8/);
    assert.match(result.stdout, /--offset 2/);
    assert.match(result.stdout, /builds --project/);
    let orgs = await runDiscoveryCLI(workspace, client.getBaseUrl(), ['orgs']);
    assert.equal(orgs.code, 0, orgs.stderr);
    assert.match(orgs.stdout, /Vizzly/);
    assert.match(orgs.stdout, /PitStop/);
    assert.match(orgs.stdout, /Count:\s+2/);
    assert.match(orgs.stdout, /via token/);
  });

  it('clearly lists a single project and selects the available credential automatically', async t => {
    let { client, requests } = await createCloudServer(t, () => ({
      body: {
        projects: [
          {
            id: 'project-1',
            name: 'Project',
            slug: 'project',
            organizationName: 'Robert',
            organizationSlug: 'rob',
          },
        ],
        meta: { total: 1, limit: 50, offset: 0, hasMore: false },
      },
    }));
    let workspace = await createWorkspace(t, {
      accessToken: 'saved-user-credential',
      apiUrl: client.getBaseUrl(),
    });
    for (let withToken of [false, true]) {
      let result = await runDiscoveryCLI(
        workspace,
        client.getBaseUrl(),
        ['projects'],
        withToken ? { VIZZLY_TOKEN: 'vzt_explicit-project' } : {}
      );
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Name\s+Project\s+Organization/);
      assert.match(result.stdout, /Project\s+rob\/project\s+Robert/);
      assert.match(
        result.stdout,
        /Read builds: vizzly builds --project project --org rob/
      );
      assert.match(
        result.stdout,
        /Choose uploads: vizzly project link rob\/project/
      );
      assert.doesNotMatch(result.stdout, /<org>|<project>|--auth|Permissions:/);
      assert.match(
        result.stdout,
        withToken
          ? /Credential:\s+VIZZLY_TOKEN/
          : /Credential:\s+saved user login/
      );
      assert.equal(
        requests.at(-1).headers.authorization,
        withToken
          ? 'Bearer vzt_explicit-project'
          : 'Bearer saved-user-credential'
      );
    }
    let verbose = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
      'projects',
      '--verbose',
    ]);
    assert.equal(verbose.code, 0, verbose.stderr);
    assert.match(verbose.stdout, /Permissions: read, builds:write/);
  });

  it('reports empty accessible lists and distinguishes an absent login', async t => {
    let { client, requests } = await createCloudServer(t, ({ url }) => {
      let query = new URL(url, 'http://fixture').searchParams;
      return {
        body: {
          ...(url.includes('/projects')
            ? { projects: [] }
            : { organizations: [] }),
          meta: {
            total: 0,
            limit: Number(query.get('limit')),
            offset: Number(query.get('offset')),
            hasMore: false,
          },
        },
      };
    });
    let workspace = await createWorkspace(t, {
      accessToken: 'saved-user-credential',
      apiUrl: client.getBaseUrl(),
    });
    for (let command of ['projects', 'orgs']) {
      let result = await runDiscoveryCLI(workspace, client.getBaseUrl(), [
        command,
      ]);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /No (projects|organizations) found/);
    }
    let noAuth = await createWorkspace(t);
    let result = await runDiscoveryCLI(noAuth, client.getBaseUrl(), ['orgs']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Login required.*vizzly login/);
    assert.equal(requests.length, 2);
  });
});
