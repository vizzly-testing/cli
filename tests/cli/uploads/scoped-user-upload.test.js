import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTokenStore } from '../../../src/domains/auth/token-store.js';
import { findJSONMessage, runCLI } from '../../helpers/cli-runner.js';
import { createCloudServer } from '../../helpers/cloud-server.js';

let originalToken = 'synthetic-upload-user';
let refreshedToken = 'synthetic-upload-refreshed';
let image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==';

async function fixture(
  t,
  { scopes = ['builds:write'], expired = false, buildStatus = 201 } = {}
) {
  let cwd = await mkdtemp(join(tmpdir(), 'vizzly-user-upload-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let authorization = {
    sessionId: 'upload-session',
    clientId: 'vizzly-cli',
    scopes,
  };
  let { client, requests } = await createCloudServer(t, request => {
    let url = new URL(request.url, 'http://fixture');
    if (url.pathname === '/api/auth/cli/refresh') {
      assert.equal(request.body.refreshToken, 'synthetic-upload-refresh');
      return {
        body: {
          accessToken: refreshedToken,
          refreshToken: 'synthetic-upload-rotated',
          expiresIn: 3600,
          authorization,
        },
      };
    }
    if (url.pathname === '/api/auth/cli/whoami') {
      return { body: { user: { username: 'fixture-user' }, authorization } };
    }
    if (url.pathname === '/api/sdk/token/context') {
      return {
        body: { organization: { slug: 'acme' }, project: { slug: 'web' } },
      };
    }
    if (url.pathname === '/api/sdk/builds' && request.method === 'POST') {
      return {
        status: buildStatus,
        body:
          buildStatus === 201
            ? { id: 'user-build' }
            : { error: 'Rejected selected credential' },
      };
    }
    if (url.pathname === '/api/sdk/check-shas') {
      return { body: { existing: [], missing: [], screenshots: [] } };
    }
    if (url.pathname === '/api/sdk/upload')
      return { body: { build: { id: 'user-build' } } };
    if (url.pathname === '/api/sdk/builds/user-build/screenshots') {
      return {
        body: request.body.image_data
          ? { id: 'uploaded-capture' }
          : { upload_required: true },
      };
    }
    if (url.pathname === '/api/sdk/builds/user-build/status') {
      return { body: { build: { id: 'user-build', status: 'completed' } } };
    }
    if (url.pathname === '/api/sdk/parallel/user-parallel/finalize') {
      return {
        body: {
          build: {
            id: 'user-build',
            status: 'completed',
            parallel_id: 'user-parallel',
          },
        },
      };
    }
    if (url.pathname === '/api/sdk/builds/user-build/preview/upload-zip') {
      return {
        body: { preview_url: 'https://preview.example/fixture', file_count: 1 },
      };
    }
    assert.fail(`Unexpected request: ${request.method} ${request.url}`);
  });
  let apiUrl = client.getBaseUrl();
  let home = join(cwd, 'state');
  await createTokenStore({ apiUrl, home, storage: 'file' }).saveTokens({
    accessToken: originalToken,
    refreshToken: 'synthetic-upload-refresh',
    expiresAt: expired ? '2020-01-01T00:00:00Z' : '2999-01-01T00:00:00Z',
    user: { username: 'fixture-user' },
    authorization,
  });
  await writeFile(
    join(cwd, '.vizzlyrc.json'),
    JSON.stringify({
      project: { organizationSlug: 'acme', projectSlug: 'web' },
    })
  );
  let screenshots = join(cwd, 'screenshots');
  await mkdir(screenshots);
  await writeFile(
    join(screenshots, 'home-chrome.png'),
    Buffer.from(image, 'base64')
  );
  let options = { cwd, env: { VIZZLY_HOME: home, VIZZLY_API_URL: apiUrl } };
  return {
    cwd,
    apiUrl,
    screenshots,
    options,
    requests,
    token: expired ? refreshedToken : originalToken,
  };
}

function assertSelectedUser(f) {
  for (let request of f.requests.filter(
    request => !request.url.endsWith('/refresh')
  )) {
    assert.equal(request.headers.authorization, `Bearer ${f.token}`);
  }
  assert.equal(
    f.requests.filter(request => request.url.includes('/token/context')).length,
    0
  );
  for (let request of f.requests.filter(request => {
    let pathname = new URL(request.url, 'http://fixture').pathname;
    return [
      '/api/sdk/builds',
      '/api/sdk/upload',
      '/api/sdk/check-shas',
      '/api/sdk/parallel/user-parallel/finalize',
    ].includes(pathname);
  })) {
    let url = new URL(request.url, 'http://fixture');
    assert.equal(url.searchParams.get('project'), 'web');
    assert.equal(url.searchParams.get('organization'), 'acme');
  }
}

test('a write-only saved login refreshes once and uploads to its bound project', async t => {
  let f = await fixture(t, { expired: true });
  let result = await runCLI(['--json', 'upload', f.screenshots], f.options);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  let data = findJSONMessage(result.stdout, 'data').data;
  assert.equal(data.buildId, 'user-build');
  assert.equal(data.url, `${f.apiUrl}/acme/web/builds/user-build`);
  assert.equal(data.destination.credential.kind, 'user');
  assert.equal(data.destination.credential.token, undefined);
  assert.equal(data.destination.credential.session, undefined);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-upload/);
  assert.equal(
    f.requests.filter(request => request.url.endsWith('/refresh')).length,
    1
  );
  assert.ok(
    f.requests.some(
      request => request.method === 'PUT' && request.url.endsWith('/status')
    )
  );
  assertSelectedUser(f);
});

test('a write-only user run captures screenshots and finalizes with the same login', async t => {
  let f = await fixture(t, { expired: true });
  let server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  await writeFile(
    join(f.cwd, 'capture.js'),
    `
    let response = await fetch(process.env.VIZZLY_SERVER_URL + '/screenshot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'User run capture', image: '${image}', type: 'base64' })
    });
    if (!response.ok) throw new Error(await response.text());
  `
  );
  let result = await runCLI(
    ['--json', 'run', 'node capture.js', '--port', String(port)],
    f.options
  );
  assert.equal(result.code, 0, result.stderr + result.stdout);
  let data = findJSONMessage(result.stdout, 'data').data;
  assert.equal(data.buildId, 'user-build');
  assert.equal(data.uploads.uploaded, 1);
  assert.equal(data.url, `${f.apiUrl}/acme/web/builds/user-build`);
  assert.equal(
    f.requests.filter(request => request.url.endsWith('/refresh')).length,
    1
  );
  assert.equal(
    f.requests.filter(request => request.url === '/api/sdk/builds/user-build')
      .length,
    0
  );
  assert.ok(
    f.requests.some(
      request => request.url.endsWith('/screenshots') && request.body.image_data
    )
  );
  assertSelectedUser(f);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-upload/);
});

for (let command of ['upload', 'run']) {
  test(`${command} rejects a read-only login before creating builds or starting tests`, async t => {
    let f = await fixture(t, { scopes: ['read'] });
    let args =
      command === 'upload'
        ? [command, f.screenshots]
        : [command, "node -e \"require('fs').writeFileSync('started','yes')\""];
    let result = await runCLI(['--json', ...args], f.options);
    assert.equal(result.code, 1, result.stderr + result.stdout);
    assert.match(result.stderr + result.stdout, /builds:write/);
    let error =
      findJSONMessage(result.stdout, 'data')?.data.error ||
      findJSONMessage(result.stderr, 'error')?.error;
    assert.equal(error.code, 'INSUFFICIENT_SCOPE');
    assert.deepEqual(error.requiredScopes, ['builds:write']);
    assert.deepEqual(error.grantedScopes, ['read']);
    assert.equal(
      f.requests.filter(request => request.method !== 'GET').length,
      0
    );
    await assert.rejects(access(join(f.cwd, 'started')), { code: 'ENOENT' });
  });
}

test('an explicit CI token stays authoritative over an available saved login', async t => {
  let f = await fixture(t, { scopes: ['read'], expired: true });
  let result = await runCLI(['--json', 'upload', f.screenshots], {
    ...f.options,
    env: { ...f.options.env, VIZZLY_TOKEN: 'vzt_explicit-ci' },
  });
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.equal(
    f.requests.filter(request => request.url.includes('/api/auth/cli/')).length,
    0
  );
  for (let request of f.requests)
    assert.equal(request.headers.authorization, 'Bearer vzt_explicit-ci');
});

test('parallel finalization uses the saved user and explicit project binding', async t => {
  let f = await fixture(t);
  let result = await runCLI(['--json', 'finalize', 'user-parallel'], f.options);
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.ok(
    f.requests.some(request =>
      request.url.includes('/parallel/user-parallel/finalize')
    )
  );
  assertSelectedUser(f);
});

test('a write-only user uploads a preview after acknowledging public link access', async t => {
  let f = await fixture(t);
  let preview = join(f.cwd, 'preview');
  await mkdir(preview);
  await writeFile(join(preview, 'index.html'), '<h1>Preview</h1>');
  let result = await runCLI(
    ['--json', 'preview', preview, '--build', 'user-build', '--public-link'],
    f.options
  );
  assert.equal(result.code, 0, result.stderr + result.stdout);
  assert.ok(
    f.requests.some(request => request.url.endsWith('/preview/upload-zip'))
  );
  assertSelectedUser(f);
});

test('a rejected user build write is not replayed or retried as a project token', async t => {
  let f = await fixture(t, { buildStatus: 401 });
  let result = await runCLI(['--json', 'upload', f.screenshots], f.options);
  assert.equal(result.code, 1, result.stderr + result.stdout);
  assert.equal(
    f.requests.filter(
      request =>
        request.method === 'POST' && request.url.startsWith('/api/sdk/builds')
    ).length,
    1
  );
  assert.equal(
    f.requests.filter(request => request.url.endsWith('/refresh')).length,
    0
  );
  assertSelectedUser(f);
});
