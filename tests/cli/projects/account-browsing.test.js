import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getAuthStoragePath } from '../../../src/domains/auth/token-store.js';
import {
  fixtureAuthorization,
  saveFixtureAuth,
} from '../../helpers/auth-session.js';
import { findJSONMessage, runCLI } from '../../helpers/cli-runner.js';
import { createCloudServer } from '../../helpers/cloud-server.js';

let entrypoint = fileURLToPath(
  new URL('../../../bin/vizzly.js', import.meta.url)
);
let userToken = 'synthetic-user-access';
let projectToken = 'vzt_synthetic-upload';
let projects = Array.from({ length: 260 }, (_, index) => ({
  id: `project-${index}`,
  name: `Project ${index}`,
  slug: `app-${index}`,
  organizationSlug: index % 2 ? 'studio' : 'acme',
}));

function page(items, query) {
  let limit = Number(query.get('limit') || 10);
  let offset = Number(query.get('offset') || 0);
  assert.ok(limit <= 50);
  return {
    items: items.slice(offset, offset + limit),
    meta: {
      total: items.length,
      limit,
      offset,
      hasMore: offset + limit < items.length,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(items.length / limit),
    },
  };
}

async function fixture(
  t,
  { expired = false, binding = true, scopes = fixtureAuthorization.scopes } = {}
) {
  let cwd = await mkdtemp(path.join(tmpdir(), 'vizzly-account-'));
  let home = path.join(cwd, 'state');
  await mkdir(home);
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let configPath = path.join(cwd, '.vizzlyrc.json');
  await writeFile(
    configPath,
    JSON.stringify(
      binding
        ? {
            project: { organizationSlug: 'acme', projectSlug: 'app-0' },
          }
        : {}
    )
  );
  let state = {
    authorization: { ...fixtureAuthorization, scopes },
    refreshStatus: 200,
    rejectUser: false,
    failPage: null,
    projectsStatus: 200,
  };
  let { client, requests } = await createCloudServer(t, request => {
    let url = new URL(request.url, 'http://fixture');
    let bearer = request.headers.authorization;
    if (url.pathname === '/api/auth/cli/refresh') {
      assert.ok(
        ['synthetic-refresh', 'synthetic-rotated'].includes(
          request.body.refreshToken
        )
      );
      return {
        status: state.refreshStatus,
        body:
          state.refreshStatus === 200
            ? {
                accessToken: 'synthetic-refreshed',
                refreshToken: 'synthetic-rotated',
                expiresIn: 3600,
                authorization: state.authorization,
              }
            : { error: 'refresh rejected' },
      };
    }
    if (state.rejectUser && bearer !== `Bearer ${projectToken}`) {
      return { status: 401, body: { error: 'invalid user' } };
    }
    if (url.pathname === '/api/auth/cli/whoami') {
      return {
        body: {
          user: { name: 'Fixture user' },
          organizations: [],
          authorization: state.authorization,
        },
      };
    }
    if (url.pathname === '/api/sdk/projects') {
      assert.equal(request.headers['vizzly-api-version'], '2026-09-12');
      if (state.projectsStatus !== 200) {
        return {
          status: state.projectsStatus,
          body: { error: 'Project access denied' },
        };
      }
      if (state.failPage === Number(url.searchParams.get('offset'))) {
        return { status: 503, body: { error: 'offline' } };
      }
      let visible =
        bearer === `Bearer ${projectToken}` ? projects.slice(0, 1) : projects;
      let org = url.searchParams.get('organization');
      if (org) visible = visible.filter(p => p.organizationSlug === org);
      let { items, meta } = page(visible, url.searchParams);
      return { body: { projects: items, meta } };
    }
    if (url.pathname === '/api/sdk/organizations') {
      let { items, meta } = page(
        [
          { id: 'o-1', slug: 'acme', name: 'Acme' },
          { id: 'o-2', slug: 'studio', name: 'Studio' },
        ],
        url.searchParams
      );
      return { body: { organizations: items, meta } };
    }
    if (url.pathname === '/api/sdk/builds') {
      if (
        url.searchParams.get('project') === 'web' &&
        !url.searchParams.has('organization')
      ) {
        return {
          status: 409,
          body: {
            error:
              'Project slug web is ambiguous. Specify --org acme or --org studio.',
          },
        };
      }
      assert.equal(url.searchParams.get('project'), 'app-1');
      assert.equal(url.searchParams.get('organization'), 'studio');
      assert.notEqual(bearer, `Bearer ${projectToken}`);
      let { items, meta } = page(state.builds || [], url.searchParams);
      return { body: { builds: items, meta } };
    }
    if (url.pathname === '/api/sdk/token/context') {
      return {
        body: { organization: { slug: 'acme' }, project: { slug: 'app-0' } },
      };
    }
    return { status: 404, body: { error: 'Unexpected fixture request' } };
  });
  let apiUrl = client.getBaseUrl();
  let authPath = getAuthStoragePath(apiUrl, home);
  await saveFixtureAuth(home, apiUrl, {
    accessToken: userToken,
    refreshToken: 'synthetic-refresh',
    expiresAt: expired ? '2020-01-01T00:00:00Z' : '2999-01-01T00:00:00Z',
    user: { name: 'Fixture user' },
    authorization: state.authorization,
  });
  async function cli(args, env = {}) {
    let result = await runCLI(['--no-color', ...args], {
      cwd,
      entrypoint,
      env: {
        VIZZLY_HOME: home,
        VIZZLY_API_URL: apiUrl,
        VIZZLY_DISABLE_KEYCHAIN: 'true',
        ...env,
      },
    });
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic-user-access|vzt_synthetic-upload|synthetic-refresh|synthetic-rotated/
    );
    return result;
  }
  return { cwd, home, authPath, configPath, apiUrl, state, requests, cli };
}

let data = result => findJSONMessage(result.stdout, 'data')?.data;

test('built CLI browses account projects with another upload destination and leaves bindings unchanged', async t => {
  let f = await fixture(t);
  let before = await readFile(f.configPath, 'utf8');
  let authBefore = await readFile(f.authPath, 'utf8');
  let env = { VIZZLY_TOKEN: projectToken };
  let restricted = await f.cli(['projects', '--json'], env);
  assert.equal(restricted.code, 0, restricted.stderr);
  assert.equal(data(restricted).projects.length, 1);
  assert.equal(data(restricted).auth.source, 'environment');
  let all = await f.cli(
    ['projects', '--auth', 'user', '--limit', '250', '--json'],
    env
  );
  assert.equal(all.code, 0, all.stderr);
  assert.equal(data(all).projects.length, 250);
  assert.equal(data(all).pagination.nextOffset, 250);
  assert.equal(data(all).pagination.hasMore, true);
  let last = await f.cli(
    ['projects', '--auth', 'user', '--offset', '250', '--json'],
    env
  );
  assert.equal(data(last).projects.length, 10);
  assert.equal(data(last).pagination.hasMore, false);
  let builds = await f.cli(
    [
      'builds',
      '--auth',
      'user',
      '--project',
      'app-1',
      '--org',
      'studio',
      '--json',
    ],
    env
  );
  assert.equal(builds.code, 0, builds.stderr);
  let orgs = await f.cli(['orgs', '--auth', 'user', '--json'], env);
  assert.equal(data(orgs).count, 2);
  let status = await f.cli(['project', 'status', '--json'], env);
  assert.equal(data(status).status, 'verified');
  assert.deepEqual(data(status).effective, {
    organizationSlug: 'acme',
    projectSlug: 'app-0',
  });
  assert.equal(await readFile(f.configPath, 'utf8'), before);
  assert.equal(await readFile(f.authPath, 'utf8'), authBefore);
  assert.ok(f.requests.every(request => request.method === 'GET'));
});

test('explicit tokens, source selection, and noninteractive missing targets are deliberate', async t => {
  let f = await fixture(t);
  let explicit = await f.cli(['--token', projectToken, 'projects', '--json']);
  assert.equal(data(explicit).projects.length, 1);
  assert.equal(data(explicit).auth.source, 'flag');
  for (let args of [
    ['projects', '--auth', 'invalid'],
    ['--token', projectToken, 'projects', '--auth', 'user'],
    ['projects', '--auth', 'token'],
    ['projects', '--offset', '10001', '--json'],
    ['project', 'link', '--json'],
    ['project', 'link', 'web', '--json'],
  ]) {
    let before = f.requests.length;
    let result = await f.cli(args);
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.equal(f.requests.length, before);
    if (args.includes('10001')) assert.match(result.stderr, /0 and 10000/);
  }
  let human = await f.cli(['projects'], { VIZZLY_TOKEN: projectToken });
  assert.match(human.stdout + human.stderr, /only its project/);
  assert.match(human.stdout + human.stderr, /Credential:\s+VIZZLY_TOKEN/);
  assert.match(human.stdout + human.stderr, /Unset VIZZLY_TOKEN/);
  assert.doesNotMatch(human.stdout + human.stderr, /--auth user/);
  assert.doesNotMatch(human.stdout + human.stderr, /undefined/);
});

test('expired and near-expiry saved sessions recover without falling back to the upload token', async t => {
  for (let expiresAt of [
    '2020-01-01T00:00:00Z',
    new Date(Date.now() + 120000).toISOString(),
  ]) {
    let f = await fixture(t);
    let auth = JSON.parse(await readFile(f.authPath, 'utf8'));
    auth.expiresAt = expiresAt;
    await writeFile(f.authPath, JSON.stringify(auth));
    let result = await f.cli(['projects', '--auth', 'user', '--json'], {
      VIZZLY_TOKEN: projectToken,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(f.requests[0].url, '/api/auth/cli/refresh');
    let saved = JSON.parse(await readFile(f.authPath, 'utf8'));
    assert.equal(saved.accessToken, 'synthetic-refreshed');
    assert.equal(saved.user.name, 'Fixture user');
    assert.ok(Date.parse(saved.expiresAt) > Date.now());
    assert.equal(f.requests.filter(r => r.url.includes('/refresh')).length, 1);
  }
});

test('rejected refreshes preserve credentials and uncertain server failures prevent token replay', async t => {
  for (let status of [401, 503]) {
    let f = await fixture(t, { expired: true });
    f.state.refreshStatus = status;
    let before = await readFile(f.authPath, 'utf8');
    let result = await f.cli(['projects', '--auth', 'user', '--json'], {
      VIZZLY_TOKEN: projectToken,
    });
    assert.equal(result.code, 1);
    assert.equal(f.requests.length, 1);
    if (status === 401) {
      assert.equal(await readFile(f.authPath, 'utf8'), before);
      assert.match(result.stderr, /LOGIN_REQUIRED|vizzly login/);
    } else {
      let saved = JSON.parse(await readFile(f.authPath, 'utf8'));
      assert.deepEqual(saved, {
        ...JSON.parse(before),
        refreshUncertain: true,
      });
      assert.match(result.stderr, /AUTH_REFRESH_UNCERTAIN/);
      assert.match(result.stderr, /vizzly login/);
      let retried = await f.cli(['projects', '--json']);
      assert.equal(retried.code, 1);
      assert.match(retried.stderr, /AUTH_REFRESH_UNCERTAIN/);
      assert.equal(f.requests.length, 1);
    }
  }
});

test('whoami reports refreshed expiry and a command never refreshes twice', async t => {
  let f = await fixture(t, { expired: true });
  let who = await f.cli(['whoami', '--json']);
  assert.equal(who.code, 0, who.stderr);
  assert.ok(Date.parse(data(who).tokenExpiresAt) > Date.now());
  f.state.rejectUser = true;
  f.requests.length = 0;
  let result = await f.cli(['projects', '--auth', 'user', '--json']);
  assert.equal(result.code, 1);
  assert.equal(f.requests.filter(r => r.url.includes('/refresh')).length, 1);
  assert.equal(f.requests.filter(r => r.method === 'GET').length, 2);
});

test('a later discovery page failure never returns a partial successful catalog', async t => {
  let f = await fixture(t);
  f.state.failPage = 50;
  let result = await f.cli(['projects', '--limit', '100', '--json']);
  assert.equal(result.code, 1);
  assert.equal(data(result), undefined);
});

test('access denial and ambiguous project names do not refresh or change identity', async t => {
  let f = await fixture(t);
  f.state.projectsStatus = 403;
  let denied = await f.cli(['projects', '--auth', 'user', '--json']);
  assert.equal(denied.code, 1);
  assert.doesNotMatch(denied.stderr, /vizzly login/);
  let ambiguous = await f.cli(['builds', '--project', 'web', '--json']);
  assert.equal(ambiguous.code, 1);
  assert.match(ambiguous.stderr, /--org acme.*--org studio/);
  assert.ok(f.requests.every(r => r.method === 'GET'));
});

test('build list output shows the page total and offers a next page only when one exists', async t => {
  let f = await fixture(t);
  f.state.builds = [
    { id: 'b-1', name: 'Checkout', status: 'completed', branch: 'main' },
    { id: 'b-2', name: 'Settings', status: 'completed', branch: 'main' },
  ];
  let args = [
    'builds',
    '--project',
    'app-1',
    '--org',
    'studio',
    '--limit',
    '1',
  ];
  let first = await f.cli(args);
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /Showing 1 of 2 builds/);
  assert.match(first.stdout, /--offset 1/);
  let last = await f.cli([...args, '--offset', '1']);
  assert.equal(last.code, 0, last.stderr);
  assert.match(last.stdout, /Settings/);
  assert.doesNotMatch(last.stdout, /--offset|paging limit/);
});

test('offline project status keeps the checkout binding separate from an unverified destination', async t => {
  let f = await fixture(t);
  let result = await f.cli(['project', 'status', '--json'], {
    VIZZLY_TOKEN: projectToken,
    VIZZLY_API_URL: 'http://127.0.0.1:0',
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(data(result).status, 'unverified');
  assert.equal(data(result).effective, null);
  assert.deepEqual(data(result).configured, {
    organizationSlug: 'acme',
    projectSlug: 'app-0',
  });
});

test('explicit destinations work with write-only login and status distinguishes missing upload permission', async t => {
  for (let scopes of [['builds:write'], ['read']]) {
    let f = await fixture(t, { binding: false, scopes });
    let authBefore = await readFile(f.authPath, 'utf8');
    let linked = await f.cli(['project', 'link', 'studio/app-1', '--json']);
    assert.equal(linked.code, 0, linked.stderr);
    assert.equal(f.requests.length, 0);
    assert.equal(await readFile(f.authPath, 'utf8'), authBefore);
    let inspected = await f.cli(['project', 'status', '--json']);
    assert.equal(inspected.code, 0, inspected.stderr);
    let destination = data(inspected);
    assert.equal(destination.status, 'unverified');
    assert.equal(destination.credential.source, 'user');
    assert.deepEqual(destination.credential.authorization.scopes, scopes);
    assert.equal(
      destination.uploadPermission,
      scopes.includes('builds:write') ? 'granted' : 'missing'
    );
    assert.deepEqual(destination.effective, {
      organizationSlug: 'studio',
      projectSlug: 'app-1',
    });
    assert.deepEqual(
      f.requests.map(request => request.url),
      ['/api/auth/cli/whoami']
    );
    assert.equal(Object.hasOwn(destination.credential, 'token'), false);
    assert.equal(Object.hasOwn(destination.credential, 'session'), false);
  }
});

test('linking chooses uploads, browsing stays read-only, and a mismatched override fails before writes', async t => {
  let f = await fixture(t, { binding: false });
  let linked = await f.cli(['project', 'link', 'studio/app-1', '--json']);
  assert.equal(linked.code, 0, linked.stderr);
  let before = await readFile(f.configPath, 'utf8');
  let discovered = await f.cli(['projects', '--json']);
  assert.equal(data(discovered).auth.source, 'user');
  let browsed = await f.cli([
    'builds',
    '--auth',
    'user',
    '--project',
    'app-1',
    '--org',
    'studio',
    '--json',
  ]);
  assert.equal(browsed.code, 0, browsed.stderr);
  assert.equal(await readFile(f.configPath, 'utf8'), before);
  let screenshots = path.join(f.cwd, 'screenshots');
  await mkdir(screenshots);
  await writeFile(path.join(screenshots, 'home.png'), 'synthetic-png');
  f.requests.length = 0;
  let upload = await f.cli(['upload', screenshots, '--json'], {
    VIZZLY_TOKEN: projectToken,
  });
  assert.equal(upload.code, 1);
  assert.match(
    upload.stdout + upload.stderr,
    /UPLOAD_PROJECT_MISMATCH|does not match|configured for/
  );
  assert.ok(f.requests.every(r => r.method === 'GET'));
});
