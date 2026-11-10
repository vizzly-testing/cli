import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

let cliPath = path.resolve('src/adapters/cli/cli.js');
let projectId = 'aaaaaaaa-1234-4567-8910-123456789abc';
let otherId = 'bbbbbbbb-1234-4567-8910-123456789abc';
let directory;
let server;
let apiUrl;
let requests = [];

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vizzly-project-link-'));
  server = createServer(async (request, response) => {
    for await (let _chunk of request) {
      // Consume the external request before responding.
    }
    requests.push({
      url: request.url,
      authorization: request.headers.authorization,
    });
    response.setHeader('Content-Type', 'application/json');
    let url = new URL(request.url, 'http://fixture');
    if (url.pathname === '/api/sdk/projects') {
      response.end(
        JSON.stringify({
          projects: [
            {
              id: projectId,
              name: 'App',
              slug: 'app',
              organizationSlug: 'team',
            },
          ],
          meta: {
            total: 1,
            limit: Number(url.searchParams.get('limit')),
            offset: 0,
            hasMore: false,
          },
        })
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Unexpected cloud request' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  await rm(directory, { recursive: true, force: true });
});

async function project(name) {
  let cwd = path.join(directory, name);
  let home = path.join(cwd, 'user-state');
  await mkdir(home, { recursive: true });
  await writeFile(path.join(home, 'config.json'), '{}');
  return { cwd, home };
}

async function cli(fixture, args, token) {
  let env = {
    ...process.env,
    VIZZLY_HOME: fixture.home,
    VIZZLY_DISABLE_KEYCHAIN: 'true',
    VIZZLY_API_URL: apiUrl,
    NO_COLOR: '1',
  };
  delete env.VIZZLY_TOKEN;
  if (token) env.VIZZLY_TOKEN = token;
  let child = spawn(process.execPath, [cliPath, ...args, '--json'], {
    cwd: fixture.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  let [code] = await once(child, 'close');
  return {
    code,
    stdout,
    stderr,
    data: stdout.trim() ? JSON.parse(stdout).data : null,
  };
}

async function binding(fixture) {
  return JSON.parse(
    await readFile(path.join(fixture.cwd, 'vizzly.project.json'), 'utf8')
  );
}

describe('project linking', () => {
  it('saves a known UUID repeatedly without authentication or credential changes', async () => {
    let fixture = await project('repeat');
    let start = requests.length;
    let authPath = path.join(fixture.home, 'config.json');
    let authBefore = await readFile(authPath, 'utf8');
    let first = await cli(fixture, ['project', 'link', projectId]);
    assert.equal(first.code, 0, first.stderr + first.stdout);
    assert.equal(first.data.linked, true);
    assert.equal(first.data.changed, true);
    assert.equal(first.data.verification, 'unverified');
    assert.deepEqual(await binding(fixture), {
      version: 1,
      apiOrigin: apiUrl,
      projectId,
    });
    let filename = path.join(fixture.cwd, 'vizzly.project.json');
    let source = await readFile(filename, 'utf8');
    let second = await cli(fixture, ['project', 'link', projectId]);
    assert.equal(second.code, 0, second.stderr + second.stdout);
    assert.equal(second.data.changed, false);
    assert.equal(requests.length, start);
    assert.equal(await readFile(filename, 'utf8'), source);
    assert.equal(await readFile(authPath, 'utf8'), authBefore);
  });

  it('replaces an explicitly selected destination and reports its previous UUID', async () => {
    let fixture = await project('relink');
    assert.equal((await cli(fixture, ['project', 'link', projectId])).code, 0);
    let result = await cli(fixture, ['project', 'link', otherId]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.data.changed, true);
    assert.equal(result.data.previous.projectId, projectId);
    assert.equal((await binding(fixture)).projectId, otherId);
  });

  it('preserves executable config without needing to evaluate it for a known UUID', async () => {
    let fixture = await project('executable');
    let source =
      'throw new Error("config is unfinished");\nexport default {};\n';
    let filename = path.join(fixture.cwd, 'vizzly.config.js');
    await writeFile(filename, source);
    let start = requests.length;
    let result = await cli(fixture, ['project', 'link', projectId]);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.equal((await binding(fixture)).projectId, projectId);
    assert.equal(await readFile(filename, 'utf8'), source);
    assert.equal(requests.length, start);
  });

  it('preserves the complete package config and puts the destination in its own file', async () => {
    let fixture = await project('package');
    let filename = path.join(fixture.cwd, 'package.json');
    let source = JSON.stringify({
      name: 'fixture',
      scripts: { test: 'node --test' },
      devDependencies: { example: '1.0.0' },
      vizzly: { comparison: { threshold: 3 } },
    });
    await writeFile(filename, source);
    let result = await cli(fixture, ['project', 'link', projectId]);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.equal(await readFile(filename, 'utf8'), source);
    assert.equal((await binding(fixture)).projectId, projectId);
  });

  it('resolves qualified names using the selected token without saving that credential', async () => {
    let fixture = await project('qualified');
    let start = requests.length;
    let result = await cli(
      fixture,
      ['project', 'link', 'Team/App'],
      'vzt_fixture'
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.equal(result.data.verification, 'verified');
    assert.equal(result.data.auth.source, 'environment');
    assert.equal(result.data.organizationSlug, 'team');
    assert.deepEqual(await binding(fixture), {
      version: 1,
      apiOrigin: apiUrl,
      projectId,
    });
    assert.equal(requests.length, start + 1);
    assert.match(requests.at(-1).url, /organization=team/);
    assert.equal(requests.at(-1).authorization, 'Bearer vzt_fixture');
    assert.doesNotMatch(result.stdout, /vzt_fixture/);
  });

  it('returns structured recovery when no destination was supplied', async () => {
    let fixture = await project('missing');
    let start = requests.length;
    let result = await cli(fixture, ['project', 'link']);
    assert.equal(result.code, 1);
    let error = JSON.parse(result.stderr);
    assert.equal(error.error.code, 'PROJECT_LINK_REQUIRED');
    assert.deepEqual(error.candidates, []);
    assert.ok(
      error.recovery.some(action => action.argv.includes('--directory'))
    );
    assert.deepEqual(await readdir(fixture.cwd), ['user-state']);
    assert.equal(requests.length, start);
  });

  it('does not save an inaccessible qualified selector', async () => {
    let fixture = await project('unknown');
    let result = await cli(
      fixture,
      ['project', 'link', 'team/missing'],
      'vzt_fixture'
    );
    assert.equal(result.code, 1);
    let error = JSON.parse(result.stderr);
    assert.equal(error.error.code, 'PROJECT_LINK_REQUIRED');
    assert.equal(error.candidates[0].projectId, projectId);
    assert.deepEqual(await readdir(fixture.cwd), ['user-state']);
  });

  it('rejects token-provisioning flags without creating a project file', async () => {
    let fixture = await project('expiry');
    let result = await cli(fixture, [
      'project',
      'link',
      projectId,
      '--name',
      'Fixture link',
      '--expires-at',
      '2999-01-01T00:00:00.000Z',
    ]);
    assert.equal(result.code, 1);
    assert.match(
      result.stderr + result.stdout,
      /unknown option|automation tokens/
    );
    assert.deepEqual(await readdir(fixture.cwd), ['user-state']);
  });
});
