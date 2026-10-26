import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  parseProjectSelector,
  validateProjectLinkOptions,
} from '../../src/commands/project.js';

let cliPath = path.resolve('src/cli.js');
let directory;
let server;
let apiUrl;
let requests = [];

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vizzly-project-link-'));
  server = createServer(async (request, response) => {
    let chunks = [];
    for await (let chunk of request) chunks.push(chunk);
    requests.push({
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    let projectSlug = request.url.split('/')[3];
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        organization: { slug: request.headers['x-organization'] },
        project: { slug: projectSlug },
        token: {
          id: `id-${projectSlug}`,
          token: `vzt_fixture_${projectSlug}`,
          token_prefix: 'vzt_fix',
          expires_at: requests.at(-1).body.expiresAt || null,
        },
      })
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function project(name) {
  let cwd = path.join(directory, name);
  let home = path.join(cwd, 'user-state');
  await mkdir(home, { recursive: true });
  await writeFile(
    path.join(home, 'config.json'),
    JSON.stringify({ auth: { accessToken: 'fixture-user' } })
  );
  return { cwd, home };
}

async function cli(fixture, args) {
  let env = {
    ...process.env,
    VIZZLY_HOME: fixture.home,
    VIZZLY_DISABLE_KEYCHAIN: 'true',
    VIZZLY_API_URL: apiUrl,
    NO_COLOR: '1',
  };
  delete env.VIZZLY_TOKEN;
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

describe('project linking', () => {
  it('parses selectors and rejects missing organization/project', () => {
    assert.deepEqual(parseProjectSelector('team/app'), {
      organizationSlug: 'team',
      projectSlug: 'app',
    });
    assert.deepEqual(parseProjectSelector('app', { org: 'team' }), {
      organizationSlug: 'team',
      projectSlug: 'app',
    });
    assert.deepEqual(validateProjectLinkOptions('team/app'), []);
    assert.deepEqual(validateProjectLinkOptions(null, { org: 'team' }), [
      'Project is required. Use <org>/<project> or --project <slug>.',
    ]);
  });

  it('binds the repository and reuses credentials without a second token request', async () => {
    let fixture = await project('repeat');
    let start = requests.length;
    let first = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(first.code, 0, first.stderr + first.stdout);
    assert.equal(first.data.linked, true);
    assert.equal(first.data.reused, false);
    assert.equal(first.data.binding.status, 'bound');
    let filename = path.join(fixture.cwd, 'vizzly.config.js');
    let configSource = await readFile(filename, 'utf8');
    assert.ok(configSource.includes('"organizationSlug": "team"'));
    assert.ok(!configSource.includes('vzt_fixture'));
    assert.equal(requests.at(-1).url, '/api/cli/app/link-token');
    assert.equal(requests.at(-1).headers.authorization, 'Bearer fixture-user');
    let second = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(second.code, 0, second.stderr + second.stdout);
    assert.equal(second.data.reused, true);
    assert.equal(requests.length, start + 1);
    assert.equal(await readFile(filename, 'utf8'), configSource);
  });

  it('preserves executable config and requests an edit before minting credentials', async () => {
    let fixture = await project('executable');
    let source =
      'let threshold = Number(process.env.THRESHOLD || 2);\n' +
      '// Keep this calculation and comment.\n' +
      'export default { comparison: { threshold } };\n';
    let filename = path.join(fixture.cwd, 'vizzly.config.js');
    await writeFile(filename, source);
    let start = requests.length;
    let result = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(result.code, 2, result.stderr + result.stdout);
    assert.equal(result.data.linked, false);
    assert.equal(result.data.binding.status, 'manual');
    assert.ok(result.data.binding.instructions.includes('organizationSlug'));
    assert.equal(await readFile(filename, 'utf8'), source);
    assert.equal(requests.length, start);
  });

  it('adds a binding to an empty scaffold without losing comments', async () => {
    let fixture = await project('commented');
    let filename = path.join(fixture.cwd, 'vizzly.config.ts');
    await writeFile(
      filename,
      '// Project configuration\nexport default {\n  // Comparison overrides go here.\n};\n'
    );
    let result = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    let source = await readFile(filename, 'utf8');
    assert.ok(source.includes('// Project configuration'));
    assert.ok(source.includes('// Comparison overrides go here.'));
    assert.ok(source.includes('"projectSlug": "app"'));
  });

  it('updates only package config while preserving scripts and dependencies', async () => {
    let fixture = await project('package');
    let filename = path.join(fixture.cwd, 'package.json');
    await writeFile(
      filename,
      JSON.stringify({
        name: 'fixture',
        scripts: { test: 'node --test' },
        devDependencies: { example: '1.0.0' },
        vizzly: { comparison: { threshold: 3 } },
      })
    );
    let result = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    let actual = JSON.parse(await readFile(filename, 'utf8'));
    assert.deepEqual(actual.scripts, { test: 'node --test' });
    assert.deepEqual(actual.devDependencies, { example: '1.0.0' });
    assert.deepEqual(actual.vizzly.comparison, { threshold: 3 });
    assert.deepEqual(actual.vizzly.project, {
      organizationSlug: 'team',
      projectSlug: 'app',
    });
  });

  it('retains explicit token name and expiration for a requested new credential', async () => {
    let fixture = await project('expiry');
    let result = await cli(fixture, [
      'project',
      'link',
      'team/app',
      '--name',
      'Fixture link',
      '--expires-at',
      '2999-01-01T00:00:00.000Z',
    ]);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.deepEqual(requests.at(-1).body, {
      name: 'Fixture link',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });
  });

  it('requires login when no matching credential exists', async () => {
    let fixture = await project('anonymous');
    await writeFile(path.join(fixture.home, 'config.json'), '{}');
    let start = requests.length;
    let result = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(result.code, 1, result.stderr + result.stdout);
    assert.ok(result.stderr.includes('Login required'));
    assert.equal(requests.length, start);
    await assert.rejects(readFile(path.join(fixture.cwd, 'vizzly.config.js')), {
      code: 'ENOENT',
    });
  });

  it('returns an actionable manual edit for config that cannot be evaluated', async () => {
    let fixture = await project('throwing-config');
    let source =
      'throw new Error("config is unfinished");\nexport default {};\n';
    let filename = path.join(fixture.cwd, 'vizzly.config.js');
    await writeFile(filename, source);
    let start = requests.length;
    let result = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(result.code, 2, result.stderr + result.stdout);
    assert.equal(result.data.binding.status, 'manual');
    assert.equal(requests.length, start);
    assert.equal(await readFile(filename, 'utf8'), source);
  });

  it('persists a custom API URL even when matching project identity already exists', async () => {
    let fixture = await project('custom-api');
    let filename = path.join(fixture.cwd, '.vizzlyrc.json');
    await writeFile(
      filename,
      JSON.stringify({
        project: { organizationSlug: 'team', projectSlug: 'app' },
      })
    );
    let result = await cli(fixture, ['project', 'link', 'team/app']);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    let actual = JSON.parse(await readFile(filename, 'utf8'));
    assert.equal(actual.apiUrl, apiUrl);
  });
});
