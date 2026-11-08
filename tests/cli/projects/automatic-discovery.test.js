import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  fixtureAuthorization,
  saveFixtureAuth,
} from '../../helpers/auth-session.js';
import { findJSONMessage, runCLI } from '../../helpers/cli-runner.js';
import { createCloudServer } from '../../helpers/cloud-server.js';
import { runTerminal, terminalTest } from '../../helpers/terminal-runner.js';

let execute = promisify(execFile);
let project = {
  id: 'project-web',
  slug: 'web',
  name: 'Website',
  organizationSlug: 'acme',
};
let anotherProject = {
  id: 'project-docs',
  slug: 'docs',
  name: 'Documentation',
  organizationSlug: 'acme',
};
let image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==';

async function git(cwd, ...args) {
  return execute('git', ['-C', cwd, ...args]);
}

function paginate(items, query) {
  let limit = Number(query.get('limit') || 10);
  let offset = Number(query.get('offset') || 0);
  return {
    items: items.slice(offset, offset + limit),
    meta: {
      total: items.length,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(items.length / limit),
      hasMore: offset + limit < items.length,
    },
  };
}

async function fixture(
  t,
  {
    scopes = fixtureAuthorization.scopes,
    remote = 'git@github.com:Acme/Website.git',
  } = {}
) {
  let root = await mkdtemp(join(tmpdir(), 'vizzly-auto-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let cwd = join(root, 'checkout');
  let home = join(root, 'state');
  await mkdir(cwd);
  await git(cwd, 'init', '--quiet');
  await git(
    cwd,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'Fixture'
  );
  if (remote) await git(cwd, 'remote', 'add', 'origin', remote);
  let screenshots = join(root, 'screenshots');
  await mkdir(screenshots);
  await writeFile(join(screenshots, 'home.png'), Buffer.from(image, 'base64'));
  let state = {
    authorization: { ...fixtureAuthorization, scopes },
    repositories: { 'github.com/acme/website': [project] },
    discoveryStatus: 200,
  };
  let { client, requests } = await createCloudServer(t, request => {
    let url = new URL(request.url, 'http://fixture');
    if (url.pathname === '/api/auth/cli/whoami') {
      return {
        body: {
          user: { username: 'fixture-user' },
          authorization: state.authorization,
        },
      };
    }
    if (url.pathname === '/api/auth/cli/refresh') {
      return {
        status: 401,
        body: { error: 'Session rejected', code: 'INVALID_REFRESH_TOKEN' },
      };
    }
    if (url.pathname === '/api/sdk/token/context') {
      return {
        body: { organization: { slug: 'acme' }, project: { slug: 'web' } },
      };
    }
    if (url.pathname === '/api/sdk/projects') {
      if (state.discoveryStatus !== 200) {
        return {
          status: state.discoveryStatus,
          body: { error: 'Project discovery unavailable' },
        };
      }
      let repository = url.searchParams.get('repository');
      let visible = state.repositories[repository] || [];
      let organization = url.searchParams.get('organization');
      if (organization)
        visible = visible.filter(
          item => item.organizationSlug === organization
        );
      let { items, meta } = paginate(visible, url.searchParams);
      return { body: { projects: items, meta } };
    }
    if (url.pathname === '/api/sdk/comparisons/search') {
      let { meta } = paginate([], url.searchParams);
      return { body: { comparisons: [], pagination: meta } };
    }
    if (url.pathname === '/api/sdk/context/screenshots/Header') {
      return {
        body: {
          resource: 'screenshot_context',
          scope: { organization: { slug: 'acme' }, project: { slug: 'web' } },
          screenshot: { name: 'Header' },
          history: { recent_comparisons: [] },
        },
      };
    }
    if (url.pathname === '/api/sdk/context/review-queue') {
      return { body: { resource: 'review_queue_context', comparisons: [] } };
    }
    if (url.pathname === '/api/sdk/builds' && request.method === 'GET') {
      let { items, meta } = paginate([], url.searchParams);
      return { body: { builds: items, meta } };
    }
    if (url.pathname === '/api/sdk/builds' && request.method === 'POST') {
      return { status: 201, body: { id: 'auto-build' } };
    }
    if (url.pathname === '/api/sdk/check-shas') {
      return { body: { existing: [], missing: [], screenshots: [] } };
    }
    if (url.pathname === '/api/sdk/upload') {
      return { body: { build: { id: 'auto-build' } } };
    }
    if (url.pathname === '/api/sdk/builds/auto-build/screenshots') {
      return {
        body: request.body?.image_data
          ? { id: 'auto-capture' }
          : { upload_required: true },
      };
    }
    if (url.pathname === '/api/sdk/builds/auto-build/status') {
      return { body: { build: { id: 'auto-build', status: 'completed' } } };
    }
    return {
      status: 404,
      body: {
        error: `Unexpected fixture request ${request.method} ${url.pathname}`,
      },
    };
  });
  let apiUrl = client.getBaseUrl();
  await saveFixtureAuth(home, apiUrl, { authorization: state.authorization });
  async function cli(args, { directory = cwd, env = {} } = {}) {
    let result = await runCLI(['--no-color', ...args], {
      cwd: directory,
      env: { VIZZLY_HOME: home, VIZZLY_API_URL: apiUrl, ...env },
    });
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /fixture-user|fixture-refresh|vzt_explicit/
    );
    return result;
  }
  return { root, cwd, home, apiUrl, screenshots, state, requests, cli };
}

function data(result) {
  assert.equal(result.code, 0, result.stderr + result.stdout);
  return findJSONMessage(result.stdout, 'data')?.data;
}

function discoveryRequests(f) {
  return f.requests.filter(request =>
    request.url.startsWith('/api/sdk/projects?')
  );
}

function buildRequests(f, method) {
  return f.requests.filter(
    request =>
      new URL(request.url, 'http://fixture').pathname === '/api/sdk/builds' &&
      request.method === method
  );
}

function assertProjectQuery(request, expected = project) {
  let query = new URL(request.url, 'http://fixture').searchParams;
  assert.equal(query.get('project'), expected.slug);
  assert.equal(query.get('organization'), expected.organizationSlug);
}

test('a logged-in checkout discovers its project for status, build reads, and uploads without writing a binding', async t => {
  let f = await fixture(t);
  let remoteConfig = await readFile(join(f.cwd, '.git', 'config'), 'utf8');
  let destination = data(await f.cli(['--json', 'project', 'status']));
  assert.deepEqual(destination.effective, {
    organizationSlug: 'acme',
    projectSlug: 'web',
  });
  assert.equal(destination.configured, null);
  data(await f.cli(['--json', 'builds']));
  assertProjectQuery(buildRequests(f, 'GET').at(-1));
  let uploaded = data(await f.cli(['--json', 'upload', f.screenshots]));
  assert.equal(uploaded.buildId, 'auto-build');
  assertProjectQuery(buildRequests(f, 'POST').at(-1));
  assert.ok(discoveryRequests(f).length >= 3);
  assert.ok(
    discoveryRequests(f).every(
      request =>
        new URL(request.url, 'http://fixture').searchParams.get(
          'repository'
        ) === 'github.com/acme/website'
    )
  );
  await assert.rejects(access(join(f.cwd, 'vizzly.config.js')), {
    code: 'ENOENT',
  });
  await assert.rejects(access(join(f.cwd, '.vizzlyrc.json')), {
    code: 'ENOENT',
  });
  assert.equal(
    await readFile(join(f.cwd, '.git', 'config'), 'utf8'),
    remoteConfig
  );
});

test('explicit config and project tokens bypass repository discovery', async t => {
  let f = await fixture(t);
  f.state.discoveryStatus = 503;
  await writeFile(
    join(f.cwd, '.vizzlyrc.json'),
    JSON.stringify({
      project: { organizationSlug: 'acme', projectSlug: 'docs' },
    })
  );
  data(await f.cli(['--json', 'upload', f.screenshots]));
  assertProjectQuery(buildRequests(f, 'POST').at(-1), anotherProject);
  data(await f.cli(['--json', 'builds']));
  assertProjectQuery(buildRequests(f, 'GET').at(-1), anotherProject);
  data(
    await f.cli(['--json', 'builds'], {
      env: { VIZZLY_TOKEN: 'vzt_explicit' },
    })
  );
  let tokenRead = buildRequests(f, 'GET').at(-1);
  assert.equal(tokenRead.headers.authorization, 'Bearer vzt_explicit');
  assert.equal(
    new URL(tokenRead.url, 'http://fixture').searchParams.has('project'),
    false
  );
  await rm(join(f.cwd, '.vizzlyrc.json'));
  data(
    await f.cli(['--json', 'upload', f.screenshots], {
      env: { VIZZLY_TOKEN: 'vzt_explicit' },
    })
  );
  assert.equal(
    buildRequests(f, 'POST').at(-1).headers.authorization,
    'Bearer vzt_explicit'
  );
  assert.equal(discoveryRequests(f).length, 0);
});

test('equivalent remotes and duplicate project matches select one destination', async t => {
  let f = await fixture(t);
  await git(
    f.cwd,
    'remote',
    'add',
    'upstream',
    'https://github.com/acme/website.git'
  );
  data(await f.cli(['--json', 'upload', f.screenshots]));
  assertProjectQuery(buildRequests(f, 'POST').at(-1));
  assert.equal(discoveryRequests(f).length, 1);
  await git(
    f.cwd,
    'remote',
    'set-url',
    'upstream',
    'https://github.com/acme/shared.git'
  );
  f.state.repositories['github.com/acme/shared'] = [project];
  data(await f.cli(['--json', 'upload', f.screenshots]));
  assertProjectQuery(buildRequests(f, 'POST').at(-1));
});

for (let mode of ['monorepo', 'fork']) {
  test(`${mode} ambiguity stops unattended uploads and lists the matching projects`, async t => {
    let f = await fixture(t);
    if (mode === 'monorepo')
      f.state.repositories['github.com/acme/website'] = [
        project,
        anotherProject,
      ];
    else {
      await git(
        f.cwd,
        'remote',
        'add',
        'upstream',
        'https://github.com/acme/shared.git'
      );
      f.state.repositories['github.com/acme/shared'] = [anotherProject];
    }
    let result = await f.cli(['--json', 'upload', f.screenshots]);
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /PROJECT_SELECTION_AMBIGUOUS/);
    assert.match(result.stdout + result.stderr, /web/);
    assert.match(result.stdout + result.stderr, /docs/);
    assert.equal(buildRequests(f, 'POST').length, 0);
  });
}

test('no matching project blocks uploads while build reads stay account-wide', async t => {
  let f = await fixture(t);
  f.state.repositories = {};
  let result = await f.cli(['--json', 'upload', f.screenshots]);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /UPLOAD_PROJECT_REQUIRED/);
  assert.equal(buildRequests(f, 'POST').length, 0);
  data(await f.cli(['--json', 'builds']));
  let query = new URL(buildRequests(f, 'GET').at(-1).url, 'http://fixture')
    .searchParams;
  assert.equal(query.has('project'), false);
});

test('project discovery respects read-only and build-only grants', async t => {
  let reader = await fixture(t, { scopes: ['read'] });
  data(await reader.cli(['--json', 'builds']));
  assertProjectQuery(buildRequests(reader, 'GET').at(-1));
  let deniedUpload = await reader.cli(['--json', 'upload', reader.screenshots]);
  assert.equal(deniedUpload.code, 1);
  assert.match(deniedUpload.stdout + deniedUpload.stderr, /INSUFFICIENT_SCOPE/);
  assert.equal(buildRequests(reader, 'POST').length, 0);
  let writer = await fixture(t, { scopes: ['builds:write'] });
  let deniedDiscovery = await writer.cli([
    '--json',
    'upload',
    writer.screenshots,
  ]);
  assert.equal(deniedDiscovery.code, 1);
  assert.match(
    deniedDiscovery.stdout + deniedDiscovery.stderr,
    /INSUFFICIENT_SCOPE/
  );
  assert.equal(buildRequests(writer, 'POST').length, 0);
  await writeFile(
    join(writer.cwd, '.vizzlyrc.json'),
    JSON.stringify({
      project: { organizationSlug: 'acme', projectSlug: 'web' },
    })
  );
  data(await writer.cli(['--json', 'upload', writer.screenshots]));
  assert.equal(discoveryRequests(writer).length, 0);
  assertProjectQuery(buildRequests(writer, 'POST').at(-1));
});

for (let status of [401, 403, 503]) {
  test(`discovery HTTP ${status} prevents writes and account-wide fallback`, async t => {
    let f = await fixture(t);
    f.state.discoveryStatus = status;
    for (let args of [
      ['--json', 'upload', f.screenshots],
      ['--json', 'builds'],
    ]) {
      let result = await f.cli(args);
      if (status === 503 && args.includes('upload')) {
        assert.equal(data(result).status, 'skipped');
      } else {
        assert.equal(result.code, 1, result.stdout + result.stderr);
      }
    }
    assert.equal(buildRequests(f, 'POST').length, 0);
    assert.equal(buildRequests(f, 'GET').length, 0);
  });
}

test('selection is derived again after a GitHub connection changes', async t => {
  let f = await fixture(t);
  data(await f.cli(['--json', 'upload', f.screenshots]));
  assertProjectQuery(buildRequests(f, 'POST').at(-1));
  f.state.repositories['github.com/acme/website'] = [anotherProject];
  data(await f.cli(['--json', 'upload', f.screenshots]));
  assertProjectQuery(buildRequests(f, 'POST').at(-1), anotherProject);
  f.state.repositories = {};
  let result = await f.cli(['--json', 'upload', f.screenshots]);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.equal(buildRequests(f, 'POST').length, 2);
});

test('HTTPS remotes are discovered from nested directories and Git worktrees', async t => {
  let f = await fixture(t, { remote: 'https://github.com/acme/website.git' });
  let subdir = join(f.cwd, 'packages', 'web');
  await mkdir(subdir, { recursive: true });
  let nested = data(
    await f.cli(['--json', 'project', 'status'], { directory: subdir })
  );
  assert.equal(nested.effective.projectSlug, 'web');
  let worktree = join(f.root, 'worktree');
  await git(f.cwd, 'worktree', 'add', '--quiet', '-b', 'feature', worktree);
  let linked = data(
    await f.cli(['--json', 'project', 'status'], { directory: worktree })
  );
  assert.equal(linked.effective.projectSlug, 'web');
  assert.ok(
    discoveryRequests(f).every(
      request =>
        new URL(request.url, 'http://fixture').searchParams.get(
          'repository'
        ) === 'github.com/acme/website'
    )
  );
});

test('an unreachable discovery API never creates a build or falls back to another destination', async t => {
  let f = await fixture(t);
  let server = createServer();
  let ready = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await ready;
  let apiUrl = `http://127.0.0.1:${server.address().port}`;
  await new Promise(resolve => server.close(resolve));
  await saveFixtureAuth(f.home, apiUrl);
  let result = await f.cli(['--json', 'upload', f.screenshots], {
    env: { VIZZLY_API_URL: apiUrl },
  });
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.equal(
    findJSONMessage(result.stdout, 'data').data.error.code,
    'NETWORK_ERROR'
  );
  assert.equal(f.requests.length, 0);
});

terminalTest(
  'choosing a connected project is remembered and rechecked before the next unattended upload',
  async t => {
    let f = await fixture(t);
    f.state.repositories['github.com/acme/website'] = [project, anotherProject];
    let entrypoint = fileURLToPath(
      new URL('../../../src/adapters/cli/cli.js', import.meta.url)
    );
    let result = await runTerminal(
      t,
      f.cwd,
      [['Choose project number (q to cancel)', '2\n']],
      {
        VIZZLY_API_URL: f.apiUrl,
        VIZZLY_HOME: f.home,
        VIZZLY_NO_UPDATE_NOTIFIER: '1',
      },
      ['upload', f.screenshots],
      entrypoint
    );
    assert.equal(result.code, 0, result.output);
    assertProjectQuery(buildRequests(f, 'POST').at(-1), anotherProject);
    data(await f.cli(['--json', 'upload', f.screenshots]));
    assertProjectQuery(buildRequests(f, 'POST').at(-1), anotherProject);
    f.state.repositories['github.com/acme/website'] = [project];
    data(await f.cli(['--json', 'upload', f.screenshots]));
    assertProjectQuery(buildRequests(f, 'POST').at(-1), project);
    await assert.rejects(access(join(f.cwd, 'vizzly.config.js')), {
      code: 'ENOENT',
    });
  }
);

test('all matching projects are considered when a repository spans multiple API pages', async t => {
  let f = await fixture(t);
  f.state.repositories['github.com/acme/website'] = Array.from(
    { length: 51 },
    (_, index) => ({
      id: `project-${index}`,
      name: `App ${index}`,
      slug: `app-${index}`,
      organizationSlug: 'acme',
    })
  );
  let result = await f.cli(['--json', 'upload', f.screenshots]);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /acme\/app-50/);
  assert.equal(buildRequests(f, 'POST').length, 0);
  assert.ok(
    discoveryRequests(f).some(
      request =>
        new URL(request.url, 'http://fixture').searchParams.get('offset') ===
        '50'
    )
  );
});

terminalTest(
  'a remembered monorepo choice is scoped to the package config',
  async t => {
    let f = await fixture(t);
    f.state.repositories['github.com/acme/website'] = [project, anotherProject];
    let first = join(f.cwd, 'packages', 'first');
    let second = join(f.cwd, 'packages', 'second');
    for (let directory of [first, second]) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, '.vizzlyrc.json'), '{}');
    }
    let entrypoint = fileURLToPath(
      new URL('../../../src/adapters/cli/cli.js', import.meta.url)
    );
    let chosen = await runTerminal(
      t,
      first,
      [['Choose project number (q to cancel)', '2\n']],
      {
        VIZZLY_API_URL: f.apiUrl,
        VIZZLY_HOME: f.home,
        VIZZLY_NO_UPDATE_NOTIFIER: '1',
      },
      ['upload', f.screenshots],
      entrypoint
    );
    assert.equal(chosen.code, 0, chosen.output);
    data(
      await f.cli(['--json', 'upload', f.screenshots], { directory: first })
    );
    assertProjectQuery(buildRequests(f, 'POST').at(-1), anotherProject);
    let differentPackage = await f.cli(['--json', 'upload', f.screenshots], {
      directory: second,
    });
    assert.equal(
      differentPackage.code,
      1,
      differentPackage.stdout + differentPackage.stderr
    );
    assert.match(
      differentPackage.stdout + differentPackage.stderr,
      /PROJECT_SELECTION_AMBIGUOUS/
    );
    assert.equal(buildRequests(f, 'POST').length, 2);
  }
);

test('explicit upload project and organization override config without repository lookup', async t => {
  let f = await fixture(t);
  f.state.discoveryStatus = 503;
  await writeFile(
    join(f.cwd, '.vizzlyrc.json'),
    JSON.stringify({
      project: { organizationSlug: 'acme', projectSlug: 'web' },
    })
  );
  let result = data(
    await f.cli([
      '--json',
      'upload',
      f.screenshots,
      '--project',
      'docs',
      '--org',
      'acme',
    ])
  );
  assert.equal(result.buildId, 'auto-build');
  assertProjectQuery(buildRequests(f, 'POST').at(-1), anotherProject);
  assert.equal(discoveryRequests(f).length, 0);
});

for (let flag of ['--project', '--org']) {
  test(`upload rejects an incomplete ${flag} override before contacting the API`, async t => {
    let f = await fixture(t);
    let result = await f.cli(['--json', 'upload', f.screenshots, flag, 'docs']);
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(
      result.stdout + result.stderr,
      /--project.*--org|--org.*--project/
    );
    assert.equal(f.requests.length, 0);
  });
}

test('project link can save the unique connected project from JSON mode without a selector', async t => {
  let f = await fixture(t);
  let linked = data(await f.cli(['--json', 'project', 'link']));
  assert.equal(linked.linked, true);
  assert.equal(linked.organizationSlug, 'acme');
  assert.equal(linked.projectSlug, 'web');
  let source = await readFile(join(f.cwd, 'vizzly.config.js'), 'utf8');
  assert.match(source, /"organizationSlug": "acme"/);
  assert.match(source, /"projectSlug": "web"/);
  assert.equal(discoveryRequests(f).length, 1);
  assert.equal(buildRequests(f, 'POST').length, 0);
});

for (let [args, endpoint] of [
  [['comparisons', '--name', 'Header'], '/api/sdk/comparisons/search'],
  [
    ['context', 'screenshot', 'Header', '--source', 'cloud'],
    '/api/sdk/context/screenshots/Header',
  ],
  [
    ['context', 'review-queue', '--source', 'cloud'],
    '/api/sdk/context/review-queue',
  ],
]) {
  test(`${args.join(' ')} uses the detected checkout project`, async t => {
    let f = await fixture(t);
    let result = data(await f.cli(['--json', ...args]));
    let request = f.requests.find(
      request => new URL(request.url, 'http://fixture').pathname === endpoint
    );
    assert.ok(request, JSON.stringify(f.requests));
    assertProjectQuery(request);
    if (args[0] === 'context') assert.equal(result.source, 'cloud');
    assert.equal(discoveryRequests(f).length, 1);
    assert.equal(buildRequests(f, 'POST').length, 0);
  });
}
