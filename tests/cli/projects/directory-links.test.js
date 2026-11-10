import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
let entrypoint = fileURLToPath(
  new URL('../../../src/adapters/cli/cli.js', import.meta.url)
);
let firstId = 'db429384-7714-47b3-a6c2-2003b9340449';
let secondId = '5fe94c49-d5d1-44eb-9f05-4dc90b631a27';
let userToken = 'synthetic-directory-user';
let projectToken = 'vzt_synthetic-directory-token';
let image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==';
let data = result => findJSONMessage(result.stdout, 'data')?.data;
let failure = result =>
  findJSONMessage(result.stdout, 'error') ||
  findJSONMessage(result.stderr, 'error');

function page(items, query) {
  let limit = Number(query.get('limit') || 10);
  let offset = Number(query.get('offset') || 0);
  return {
    meta: {
      total: items.length,
      limit,
      offset,
      hasMore: offset + limit < items.length,
    },
    items: items.slice(offset, offset + limit),
  };
}

async function fixture(
  t,
  { login = true, scopes = fixtureAuthorization.scopes } = {}
) {
  let root = await mkdtemp(path.join(tmpdir(), 'vizzly-directory-links-'));
  let cwd = path.join(root, 'checkout');
  let home = path.join(root, 'state');
  await mkdir(cwd);
  await mkdir(home);
  await execute('git', ['init', '--quiet', cwd]);
  t.after(() => rm(root, { recursive: true, force: true }));
  let state = {
    projects: [
      { id: firstId, name: 'Website', slug: 'web', organizationSlug: 'acme' },
    ],
    denied: false,
    tokenProjectId: firstId,
  };
  let { client, requests } = await createCloudServer(t, async request => {
    let url = new URL(request.url, 'http://fixture');
    if (url.pathname === '/api/auth/cli/whoami')
      return {
        body: {
          user: { username: 'fixture-user' },
          authorization: { ...fixtureAuthorization, scopes },
        },
      };
    if (url.pathname === '/api/sdk/projects') {
      await state.onProjects?.();
      if (
        state.rejectProjectToken &&
        request.headers.authorization === `Bearer ${projectToken}`
      )
        return {
          status: 403,
          body: { error: 'Selected project token cannot list projects' },
        };
      let selected = state.projects.filter(
        project =>
          !url.searchParams.has('organization') ||
          project.organizationSlug === url.searchParams.get('organization')
      );
      let { items, meta } = page(selected, url.searchParams);
      return { body: { projects: items, meta } };
    }
    if (url.pathname === '/api/sdk/token/context')
      return {
        body: {
          organization: { slug: 'acme' },
          project: { id: state.tokenProjectId, slug: 'web' },
        },
      };
    if (url.pathname === '/api/sdk/builds' && request.method === 'GET') {
      if (state.denied)
        return {
          status: 403,
          body: { error: 'You cannot access this project' },
        };
      let { meta } = page([], url.searchParams);
      return { body: { builds: [], meta } };
    }
    if (url.pathname === '/api/sdk/builds' && request.method === 'POST')
      return { status: 201, body: { id: 'directory-build' } };
    if (url.pathname === '/api/sdk/builds/known-build')
      return {
        body: { id: 'known-build', status: 'completed', name: 'Known build' },
      };
    if (url.pathname === '/api/sdk/check-shas')
      return { body: { existing: [], missing: [], screenshots: [] } };
    if (url.pathname === '/api/sdk/upload')
      return { body: { build: { id: 'directory-build' } } };
    if (url.pathname === '/api/sdk/builds/directory-build/screenshots')
      return {
        body: request.body.image_data
          ? { id: 'directory-capture' }
          : { upload_required: true },
      };
    if (url.pathname === '/api/sdk/builds/directory-build/status')
      return {
        body: { build: { id: 'directory-build', status: 'completed' } },
      };
    if (url.pathname === '/api/sdk/comparisons/search')
      return {
        body: { comparisons: [], pagination: { total: 0, hasMore: false } },
      };
    if (url.pathname === '/api/sdk/comparisons/known-comparison')
      return {
        body: {
          comparison: {
            id: 'known-comparison',
            name: 'Known comparison',
            result: 'identical',
          },
        },
      };
    assert.fail(`Unexpected fixture request: ${request.method} ${request.url}`);
  });
  let apiUrl = client.getBaseUrl();
  let environment = {
    VIZZLY_HOME: home,
    VIZZLY_API_URL: apiUrl,
    VIZZLY_DISABLE_KEYCHAIN: 'true',
    VIZZLY_NO_UPDATE_NOTIFIER: '1',
  };
  if (login)
    await saveFixtureAuth(home, apiUrl, {
      accessToken: userToken,
      authorization: { ...fixtureAuthorization, scopes },
    });
  async function cli(args, { directory = cwd, env = {} } = {}) {
    let result = await runCLI(['--no-color', '--json', ...args], {
      cwd: directory,
      entrypoint,
      env: { ...environment, ...env },
    });
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic-directory-user|vzt_synthetic-directory-token|fixture-refresh/
    );
    return result;
  }
  async function link(projectId = firstId, directory = cwd) {
    let result = await cli([
      'project',
      'link',
      projectId,
      '--directory',
      directory,
    ]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    return result;
  }
  async function persisted(directory = cwd) {
    return JSON.parse(
      await readFile(path.join(directory, 'vizzly.project.json'), 'utf8')
    );
  }
  async function screenshots() {
    let directory = path.join(root, 'screenshots');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'home.png'),
      Buffer.from(image, 'base64')
    );
    return directory;
  }
  return {
    root,
    cwd,
    home,
    apiUrl,
    environment,
    state,
    requests,
    cli,
    link,
    persisted,
    screenshots,
  };
}

function assertBuildTarget(requests, projectId) {
  let builds = requests.filter(
    request =>
      new URL(request.url, 'http://fixture').pathname === '/api/sdk/builds'
  );
  assert.ok(builds.length > 0);
  for (let request of builds) {
    let query = new URL(request.url, 'http://fixture').searchParams;
    assert.equal(query.get('project'), projectId);
    assert.equal(query.has('organization'), false);
  }
}

test('agents link an exact project offline without editing capture config or credentials', async t => {
  let f = await fixture(t, { login: false });
  let config =
    'let threshold = Number(process.env.THRESHOLD || 2);\n// Keep this calculation.\nexport default { comparison: { threshold } };\n';
  let configPath = path.join(f.cwd, 'vizzly.config.js');
  await writeFile(configPath, config);
  let before = await readdir(f.home);
  let first = await f.link();
  assert.equal(data(first).verification, 'unverified');
  assert.deepEqual(await f.persisted(), {
    version: 1,
    apiOrigin: f.apiUrl,
    projectId: firstId,
  });
  assert.equal(await readFile(configPath, 'utf8'), config);
  assert.deepEqual(await readdir(f.home), before);
  assert.equal(f.requests.length, 0);
  let filename = path.join(f.cwd, 'vizzly.project.json');
  let original = await stat(filename);
  let source = await readFile(filename, 'utf8');
  let again = await f.link();
  assert.equal(data(again).changed, false);
  assert.equal((await stat(filename)).mtimeMs, original.mtimeMs);
  assert.equal(await readFile(filename, 'utf8'), source);
  let relink = await f.link(secondId);
  assert.equal(data(relink).changed, true);
  assert.equal(data(relink).previous.projectId, firstId);
  assert.equal((await f.persisted()).projectId, secondId);
  assert.equal(f.requests.length, 0);
});

test('qualified selectors and existing flags resolve once, then renamed projects use stable IDs', async t => {
  let f = await fixture(t);
  let linked = await f.cli(['project', 'link', 'acme/web']);
  assert.equal(linked.code, 0, linked.stdout + linked.stderr);
  assert.equal(data(linked).verification, 'verified');
  assert.equal((await f.persisted()).projectId, firstId);
  let second = path.join(f.cwd, 'other');
  await mkdir(second);
  let flags = await f.cli([
    'project',
    'link',
    '--org',
    'acme',
    '--project',
    'web',
    '--directory',
    second,
  ]);
  assert.equal(flags.code, 0, flags.stdout + flags.stderr);
  assert.equal((await f.persisted(second)).projectId, firstId);
  f.state.projects[0].slug = 'renamed';
  f.state.projects[0].organizationSlug = 'renamed-org';
  f.requests.length = 0;
  let builds = await f.cli(['builds']);
  assert.equal(builds.code, 0, builds.stdout + builds.stderr);
  assertBuildTarget(f.requests, firstId);
  assert.equal(
    f.requests.some(request => request.url.includes('/projects')),
    false
  );
  assert.equal(data(builds).auth.source, 'user');
  assert.deepEqual(data(builds).projectSelection.projectQuery, {
    project: firstId,
  });
  assert.equal(data(builds).projectSelection.source, 'directory');
  assert.equal(data(builds).projectSelection.projectId, firstId);
  assert.equal(
    path.basename(data(builds).projectSelection.path),
    'vizzly.project.json'
  );
});

test('unlinked commands give agents structured recovery without discovery or writes', async t => {
  let f = await fixture(t);
  let before = await readdir(f.cwd);
  let result = await f.cli(['builds']);
  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /PROJECT_LINK_REQUIRED/);
  let error = failure(result);
  assert.ok(error, result.stdout);
  assert.deepEqual(error.recovery.argv, [
    'project',
    'link',
    '<org>/<project>',
    '--directory',
    await realpath(f.cwd),
  ]);
  assert.equal(error.scope.directory, await realpath(f.cwd));
  assert.equal(
    error.scope.path,
    path.join(await realpath(f.cwd), 'vizzly.project.json')
  );
  for (let args of [
    ['comparisons', '--name', '*'],
    ['run', 'node -e "process.exit(0)"'],
    ['finalize', 'missing-batch'],
  ]) {
    let unresolved = await f.cli(args);
    assert.notEqual(unresolved.code, 0, unresolved.stdout + unresolved.stderr);
    assert.deepEqual(failure(unresolved).recovery, error.recovery);
  }
  assert.deepEqual(await readdir(f.cwd), before);
  let upload = await f.cli(['upload', await f.screenshots()]);
  assert.notEqual(upload.code, 0, upload.stdout + upload.stderr);
  assert.deepEqual(data(upload).error.recovery, error.recovery);
  assert.equal(f.requests.length, 0);
});

test('a link applies to nested source directories and never bleeds into sibling packages', async t => {
  let f = await fixture(t);
  await writeFile(
    path.join(f.cwd, 'package.json'),
    JSON.stringify({ private: true, workspaces: ['packages/*'] })
  );
  let app = path.join(f.cwd, 'packages', 'app');
  let source = path.join(app, 'src', 'components');
  let sibling = path.join(f.cwd, 'packages', 'other');
  await mkdir(source, { recursive: true });
  await mkdir(sibling, { recursive: true });
  for (let directory of [app, sibling])
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: path.basename(directory) })
    );
  await f.link(firstId, app);
  let nested = await f.cli(['builds'], { directory: source });
  assert.equal(nested.code, 0, nested.stdout + nested.stderr);
  assertBuildTarget(f.requests, firstId);
  f.requests.length = 0;
  for (let directory of [f.cwd, sibling]) {
    let result = await f.cli(['builds'], { directory });
    assert.notEqual(result.code, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout + result.stderr,
      /PROJECT_LINK_REQUIRED|PROJECT_SCOPE_AMBIGUOUS/
    );
  }
  assert.equal(f.requests.length, 0);
});

test('pnpm roots stay ambiguous while explicit native folders use their own links', async t => {
  let f = await fixture(t);
  await writeFile(
    path.join(f.cwd, 'pnpm-workspace.yaml'),
    "packages:\n  - 'apps/*'\n"
  );
  let web = path.join(f.cwd, 'apps', 'web');
  let native = path.join(f.cwd, 'ios');
  await mkdir(web, { recursive: true });
  await mkdir(path.join(native, 'Sources'), { recursive: true });
  await writeFile(path.join(web, 'package.json'), '{"name":"web"}');
  await f.link(firstId, web);
  await f.link(secondId, native);
  let result = await f.cli(['builds'], {
    directory: path.join(native, 'Sources'),
  });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assertBuildTarget(f.requests, secondId);
  f.requests.length = 0;
  let root = await f.cli(['builds']);
  assert.notEqual(root.code, 0, root.stdout + root.stderr);
  assert.equal(f.requests.length, 0);
});

test('a link API origin mismatch fails before authentication, refresh, or network access', async t => {
  let f = await fixture(t);
  await f.link();
  let before = await readFile(path.join(f.cwd, 'vizzly.project.json'), 'utf8');
  let result = await f.cli(['builds'], {
    env: {
      VIZZLY_API_URL: f.apiUrl.replace('127.0.0.1', 'localhost'),
      VIZZLY_TOKEN: projectToken,
    },
  });
  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /origin|API.*match/i);
  assert.equal(f.requests.length, 0);
  assert.equal(
    await readFile(path.join(f.cwd, 'vizzly.project.json'), 'utf8'),
    before
  );
});

test('read-only sessions browse linked builds and reject uploads before network requests', async t => {
  let f = await fixture(t, { scopes: ['read'] });
  await f.link();
  let builds = await f.cli(['builds']);
  assert.equal(builds.code, 0, builds.stdout + builds.stderr);
  assertBuildTarget(f.requests, firstId);
  f.requests.length = 0;
  let upload = await f.cli(['upload', await f.screenshots()]);
  assert.notEqual(upload.code, 0, upload.stdout + upload.stderr);
  assert.match(upload.stdout + upload.stderr, /builds:write/);
  assert.equal(f.requests.length, 0);
});

test('a build-only login uploads directly to the saved UUID without project discovery', async t => {
  let f = await fixture(t, { scopes: ['builds:write'] });
  await f.link();
  let result = await f.cli(['upload', await f.screenshots()]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(data(result).buildId, 'directory-build');
  assertBuildTarget(f.requests, firstId);
  assert.ok(
    f.requests.every(
      request => request.headers.authorization === `Bearer ${userToken}`
    )
  );
  assert.equal(
    f.requests.some(request => /projects|token\/context/.test(request.url)),
    false
  );
});

test('environment tokens take precedence and mismatched token projects cannot change the link', async t => {
  let f = await fixture(t);
  await f.link();
  let result = await f.cli(['builds'], { env: { VIZZLY_TOKEN: projectToken } });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(data(result).auth.source, 'environment');
  assert.ok(
    f.requests.every(
      request => request.headers.authorization === `Bearer ${projectToken}`
    )
  );
  f.requests.length = 0;
  f.state.tokenProjectId = secondId;
  let upload = await f.cli(['upload', await f.screenshots()], {
    env: { VIZZLY_TOKEN: projectToken },
  });
  assert.notEqual(upload.code, 0, upload.stdout + upload.stderr);
  assert.match(upload.stdout + upload.stderr, /mismatch|does not match/i);
  assert.equal(
    f.requests.some(request => request.method === 'POST'),
    false
  );
  assert.equal((await f.persisted()).projectId, firstId);
});

test('a denied linked project fails as selected without substituting an accessible project', async t => {
  let f = await fixture(t);
  await f.link();
  f.state.projects = [
    { id: secondId, name: 'Other', slug: 'other', organizationSlug: 'acme' },
  ];
  f.state.denied = true;
  let result = await f.cli(['builds']);
  assert.notEqual(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /403|cannot access|forbidden/i);
  assertBuildTarget(f.requests, firstId);
  assert.equal(
    f.requests.some(request => request.url.includes('/projects')),
    false
  );
  assert.equal((await f.persisted()).projectId, firstId);
});

test('known build IDs bypass local project selection without changing checkout files', async t => {
  let f = await fixture(t);
  let before = await readdir(f.cwd);
  let result = await f.cli(['builds', '--build', 'known-build']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(data(result).id, 'known-build');
  assert.deepEqual(await readdir(f.cwd), before);
  assert.equal(
    f.requests.filter(request => request.url.includes('/projects')).length,
    0
  );
});

test('committed links work in another clone and in a Git worktree without machine-local mappings', async t => {
  let f = await fixture(t);
  await execute('git', ['init', '--quiet', f.cwd]);
  await f.link();
  await execute('git', ['add', 'vizzly.project.json'], { cwd: f.cwd });
  await execute(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '--quiet',
      '-m',
      'Add link',
    ],
    { cwd: f.cwd }
  );
  let clone = path.join(f.root, 'clone');
  let worktree = path.join(f.root, 'worktree');
  await execute('git', ['clone', '--quiet', '--local', f.cwd, clone]);
  await execute(
    'git',
    ['worktree', 'add', '--quiet', '-b', 'fixture-linked', worktree],
    { cwd: f.cwd }
  );
  for (let directory of [clone, worktree]) {
    f.requests.length = 0;
    let result = await f.cli(['builds'], { directory });
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assertBuildTarget(f.requests, firstId);
    assert.equal((await f.persisted(directory)).projectId, firstId);
  }
});

terminalTest(
  'humans explicitly choose a project in a real terminal and subsequent commands use the saved UUID',
  { timeout: 30000 },
  async t => {
    let f = await fixture(t);
    let result = await runTerminal(
      t,
      f.cwd,
      [['Choose project number or action', '1\n']],
      f.environment,
      ['project', 'link'],
      entrypoint
    );
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Linked/);
    assert.equal((await f.persisted()).projectId, firstId);
    f.requests.length = 0;
    let builds = await f.cli(['builds']);
    assert.equal(builds.code, 0, builds.stdout + builds.stderr);
    assertBuildTarget(f.requests, firstId);
  }
);

test('project status reports the shared destination offline without requiring login', async t => {
  let f = await fixture(t, { login: false });
  await f.link();
  let result = await f.cli(['project', 'status']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(JSON.stringify(data(result)), new RegExp(firstId));
  assert.equal(f.requests.length, 0);
});

test('a build-only login runs captures through the local server and uploads to the linked UUID', async t => {
  let f = await fixture(t, { scopes: ['builds:write'] });
  await f.link();
  await writeFile(
    path.join(f.cwd, 'capture.js'),
    `
    let response = await fetch(process.env.VIZZLY_SERVER_URL + '/screenshot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Linked capture', image: '${image}', type: 'base64' })
    });
    if (!response.ok) throw new Error(await response.text());
  `
  );
  let result = await f.cli(['run', 'node capture.js']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(data(result).buildId, 'directory-build');
  assert.equal(data(result).uploads.uploaded, 1);
  assertBuildTarget(f.requests, firstId);
  assert.equal(
    f.requests.some(request => /projects|token\/context/.test(request.url)),
    false
  );
});

test('concurrent explicit selections cannot silently overwrite another CLI selection', async t => {
  let f = await fixture(t);
  f.state.projects.push({
    id: secondId,
    name: 'Mobile',
    slug: 'mobile',
    organizationSlug: 'acme',
  });
  let release;
  let ready = new Promise(resolve => {
    release = resolve;
  });
  let arrivals = 0;
  f.state.onProjects = () => {
    arrivals++;
    if (arrivals === 2) release();
    return ready;
  };
  let results = await Promise.all([
    f.cli(['project', 'link', 'acme/web']),
    f.cli(['project', 'link', 'acme/mobile']),
  ]);
  let succeeded = results.filter(result => result.code === 0);
  let rejected = results.filter(result => result.code !== 0);
  assert.equal(succeeded.length, 1, JSON.stringify(results));
  assert.equal(rejected.length, 1, JSON.stringify(results));
  assert.match(
    rejected[0].stdout + rejected[0].stderr,
    /PROJECT_LINK_CONFLICT/
  );
  assert.equal((await f.persisted()).projectId, data(succeeded[0]).projectId);
});

test('comparison searches use the local UUID and direct IDs bypass an invalid project link', async t => {
  let f = await fixture(t);
  await f.link();
  let search = await f.cli(['comparisons', '--name', 'home*']);
  assert.equal(search.code, 0, search.stdout + search.stderr);
  assert.equal(data(search).projectSelection.projectId, firstId);
  let request = f.requests.find(request =>
    request.url.includes('/comparisons/search')
  );
  let query = new URL(request.url, f.apiUrl).searchParams;
  assert.equal(query.get('project'), firstId);
  assert.equal(query.get('name'), 'home*');
  assert.equal(query.has('organization'), false);
  await writeFile(path.join(f.cwd, 'vizzly.project.json'), '{invalid');
  for (let args of [
    ['builds', '--build', 'known-build'],
    ['comparisons', '--build', 'known-build'],
    ['comparisons', '--id', 'known-comparison'],
  ]) {
    let result = await f.cli(args);
    assert.equal(result.code, 0, result.stdout + result.stderr);
  }
  assert.equal(
    await readFile(path.join(f.cwd, 'vizzly.project.json'), 'utf8'),
    '{invalid'
  );
});

test('directory links replace implicit config destinations and stale saved tokens while explicit config and flags win', async t => {
  let f = await fixture(t);
  let configPath = path.join(f.cwd, '.vizzlyrc.json');
  let captureConfig = JSON.stringify({
    project: { organizationSlug: 'old-org', projectSlug: 'old-project' },
    comparison: { threshold: 4 },
  });
  await writeFile(configPath, captureConfig);
  let account = `${f.apiUrl}|old-org/old-project`;
  await writeFile(
    path.join(f.home, 'config.json'),
    JSON.stringify({
      projectLink: {
        active: account,
        links: {
          [account]: {
            apiUrl: f.apiUrl,
            organizationSlug: 'old-org',
            projectSlug: 'old-project',
            token: 'vzt_stale-directory-token',
            storage: 'file',
          },
        },
      },
    })
  );
  await f.link();
  let automatic = await f.cli(['builds']);
  assert.equal(automatic.code, 0, automatic.stdout + automatic.stderr);
  assert.equal(data(automatic).auth.source, 'user');
  assertBuildTarget(f.requests, firstId);
  assert.ok(
    f.requests.every(
      request => request.headers.authorization === `Bearer ${userToken}`
    )
  );
  f.requests.length = 0;
  let explicit = await f.cli(['--config', configPath, 'builds']);
  assert.equal(explicit.code, 0, explicit.stdout + explicit.stderr);
  assert.equal(data(explicit).projectSelection.source, 'explicit-config');
  let selected = new URL(
    f.requests.find(request => request.url.includes('/builds')).url,
    f.apiUrl
  ).searchParams;
  assert.equal(selected.get('project'), 'old-project');
  assert.equal(selected.get('organization'), 'old-org');
  f.requests.length = 0;
  let flag = await f.cli(['builds', '--project', secondId]);
  assert.equal(flag.code, 0, flag.stdout + flag.stderr);
  assert.equal(data(flag).projectSelection.source, 'explicit');
  assertBuildTarget(f.requests, secondId);
  assert.equal(await readFile(configPath, 'utf8'), captureConfig);
  assert.equal((await f.persisted()).projectId, firstId);
});

test('build-only agents need a known ID rather than quietly listing projects to link a name', async t => {
  let f = await fixture(t, { scopes: ['builds:write'] });
  let before = await readdir(f.cwd);
  let named = await f.cli(['project', 'link', 'acme/web']);
  assert.notEqual(named.code, 0, named.stdout + named.stderr);
  assert.match(named.stdout + named.stderr, /read/);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(await readdir(f.cwd), before);
  await f.link();
  assert.equal((await f.persisted()).projectId, firstId);
});

test('two agents selecting the same known ID share one valid file without conflicts', async t => {
  let f = await fixture(t, { login: false });
  let results = await Promise.all([f.link(), f.link()]);
  assert.ok(results.every(result => result.code === 0));
  assert.equal(results.filter(result => data(result).changed).length, 1);
  assert.deepEqual(await f.persisted(), {
    version: 1,
    apiOrigin: f.apiUrl,
    projectId: firstId,
  });
  assert.equal(f.requests.length, 0);
});

terminalTest(
  'guided init chooses the cloud project once and saves the same shared UUID link',
  { timeout: 30000 },
  async t => {
    let f = await fixture(t);
    let result = await runTerminal(
      t,
      f.cwd,
      [
        ['Add the Vizzly skill', 'n\n'],
        ['Connect this repository', 'y\n'],
        ['Apply this setup?', 'y\n'],
        ['Choose project number or action', '1\n'],
      ],
      f.environment,
      ['init'],
      entrypoint
    );
    assert.equal(result.code, 0, result.output);
    assert.equal(
      (result.output.match(/Choose project number or action/g) || []).length,
      1,
      result.output
    );
    assert.equal(
      f.requests.filter(request => request.url.includes('/projects')).length,
      1
    );
    assert.deepEqual(await f.persisted(), {
      version: 1,
      apiOrigin: f.apiUrl,
      projectId: firstId,
    });
    let configPath = path.join(f.cwd, 'vizzly.config.js');
    let captureConfig = await readFile(configPath, 'utf8');
    assert.doesNotMatch(captureConfig, /projectSlug|organizationSlug/);
    f.requests.length = 0;
    let builds = await f.cli(['builds']);
    assert.equal(builds.code, 0, builds.stdout + builds.stderr);
    assertBuildTarget(f.requests, firstId);
    assert.equal(await readFile(configPath, 'utf8'), captureConfig);
  }
);

test('named linking follows project pagination and never replaces a denied explicit token with a saved login', async t => {
  let f = await fixture(t);
  let selected = f.state.projects[0];
  f.state.projects = Array.from({ length: 55 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Other ${index}`,
    slug: `other-${index}`,
    organizationSlug: 'acme',
  }));
  f.state.projects.push(selected);
  let result = await f.cli(['project', 'link', 'acme/web']);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal((await f.persisted()).projectId, firstId);
  let offsets = f.requests
    .filter(request => request.url.includes('/projects'))
    .map(request =>
      Number(new URL(request.url, f.apiUrl).searchParams.get('offset'))
    );
  assert.deepEqual(offsets, [0, 50]);
  f.requests.length = 0;
  f.state.rejectProjectToken = true;
  let denied = await f.cli(['project', 'link', 'acme/web'], {
    env: { VIZZLY_TOKEN: projectToken },
  });
  assert.notEqual(denied.code, 0, denied.stdout + denied.stderr);
  assert.ok(f.requests.length > 0);
  assert.ok(
    f.requests.every(
      request => request.headers.authorization === `Bearer ${projectToken}`
    )
  );
  assert.equal((await f.persisted()).projectId, firstId);
});
