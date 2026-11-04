import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createTokenStore,
  getAuthStoragePath,
} from '../../../src/domains/auth/token-store.js';
import {
  fixtureAuthorization,
  saveFixtureAuth,
} from '../../helpers/auth-session.js';
import { findJSONMessage, runCLI } from '../../helpers/cli-runner.js';
import { createCloudServer } from '../../helpers/cloud-server.js';

let authorization = { ...fixtureAuthorization, scopes: ['read'] };
let user = {
  id: 'scope-user',
  username: 'scope-user',
  email: 'scopes@example.test',
};

async function fixture(t, handler) {
  let cwd = await mkdtemp(join(tmpdir(), 'vizzly-cli-scopes-'));
  let home = join(cwd, 'home');
  let bin = join(cwd, 'bin');
  await mkdir(bin);
  for (let command of ['open', 'xdg-open']) {
    await writeFile(join(bin, command), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  let { client, requests } = await createCloudServer(t, handler);
  let apiUrl = client.getBaseUrl();
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let env = {
    VIZZLY_HOME: home,
    VIZZLY_API_URL: apiUrl,
    PATH: `${bin}:${process.env.PATH}`,
  };
  return {
    cwd,
    home,
    apiUrl,
    requests,
    run: (args, envOverrides = {}) =>
      runCLI(args, { cwd, env: { ...env, ...envOverrides } }),
    store: createTokenStore({ apiUrl, home }),
  };
}

function loginResponse(received, withAuthorization = true) {
  if (received.url.endsWith('/initiate')) {
    return {
      body: {
        device_code: 'synthetic-device',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://example.test/cli/authorize',
        expires_in: 600,
        interval: 0.001,
      },
    };
  }
  assert.equal(received.url, '/api/auth/cli/device/poll');
  return {
    body: {
      user,
      organizations: [],
      tokens: {
        accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh',
        expiresIn: 900,
      },
      ...(withAuthorization ? { authorization } : {}),
    },
  };
}

function data(result) {
  return findJSONMessage(result.stdout, 'data')?.data;
}

function failure(result) {
  return findJSONMessage(result.stderr, 'error')?.error;
}

test('login requests named scopes but stores and reports only browser-granted permissions', async t => {
  let f = await fixture(t, received => loginResponse(received));
  let result = await f.run([
    'login',
    '--no-browser',
    '--scopes',
    'read,builds:write read',
    '--json',
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(f.requests[0].body, {
    client_id: 'vizzly-cli',
    scope: 'read builds:write',
  });
  let saved = await f.store.getTokens();
  assert.deepEqual(saved.authorization, authorization);
  assert.equal(saved.accessToken, 'synthetic-access');
  let loggedIn = data(result);
  assert.equal(loggedIn.apiUrl, f.apiUrl);
  assert.deepEqual(loggedIn.authorization, authorization);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /synthetic-access|synthetic-refresh/
  );
});

test('default login leaves permission defaults to the API and rejects an unscoped legacy response', async t => {
  let f = await fixture(t, received => loginResponse(received, false));
  let result = await f.run(['login', '--no-browser', '--json']);
  assert.equal(result.code, 1);
  assert.deepEqual(f.requests[0].body, { client_id: 'vizzly-cli' });
  assert.equal(failure(result).code, 'LOGIN_REQUIRED');
  assert.match(failure(result).message, /choose permissions in your browser/);
  assert.equal(await f.store.getTokens(), null);
});

test('invalid requested permissions fail before starting a browser login', async t => {
  let f = await fixture(t, () =>
    assert.fail('Invalid options must not call the API')
  );
  let result = await f.run([
    'login',
    '--no-browser',
    '--scopes',
    'read,admin',
    '--json',
  ]);
  assert.equal(result.code, 1);
  assert.equal(failure(result).code, 'INVALID_SCOPE');
  assert.deepEqual(f.requests, []);
});

test('whoami reports the selected origin, identity source, session, and actual scopes', async t => {
  let f = await fixture(t, received => {
    assert.equal(received.url, '/api/auth/cli/whoami');
    assert.equal(received.headers.authorization, 'Bearer fixture-user');
    return { body: { user, organizations: [], authorization } };
  });
  await saveFixtureAuth(f.home, f.apiUrl, { authorization });
  let result = await f.run(['whoami', '--json']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(data(result), {
    authenticated: true,
    apiUrl: f.apiUrl,
    credential: { source: 'user', kind: 'user' },
    authorization,
    user,
    organizations: [],
    tokenExpiresAt: '2999-01-01T00:00:00.000Z',
  });
  let human = await f.run(['whoami', '--no-color']);
  assert.equal(human.code, 0, human.stderr);
  assert.match(human.stdout, /saved user login/);
  assert.ok(human.stdout.includes(f.apiUrl));
  assert.match(human.stdout, /Permissions.*read/);
  assert.doesNotMatch(human.stdout, /Session|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  assert.doesNotMatch(
    result.stdout + human.stdout,
    /fixture-user-refresh|fixture-refresh/
  );
});

test('a scope denial preserves required and granted permissions without refreshing or changing identity', async t => {
  let f = await fixture(t, received => {
    assert.equal(
      new URL(received.url, 'http://fixture').pathname,
      '/api/sdk/projects'
    );
    assert.equal(received.headers.authorization, 'Bearer fixture-user');
    return {
      status: 403,
      body: {
        error: 'This CLI session needs the read permission.',
        code: 'INSUFFICIENT_SCOPE',
        requiredScopes: ['read'],
        grantedScopes: ['comments:write'],
      },
    };
  });
  await saveFixtureAuth(f.home, f.apiUrl, {
    authorization: { ...authorization, scopes: ['comments:write'] },
  });
  let before = await f.store.getTokens();
  let result = await f.run(['projects', '--json']);
  assert.equal(result.code, 1);
  let error = failure(result);
  assert.equal(error.code, 'INSUFFICIENT_SCOPE');
  assert.deepEqual(error.requiredScopes, ['read']);
  assert.deepEqual(error.grantedScopes, ['comments:write']);
  assert.match(error.message, /vizzly login --scopes "comments:write read"/);
  let raw = await f.run(['api', '/api/sdk/projects', '--json']);
  assert.equal(raw.code, 1);
  assert.equal(data(raw).error.code, 'INSUFFICIENT_SCOPE');
  assert.deepEqual(data(raw).error.requiredScopes, ['read']);
  assert.deepEqual(data(raw).error.grantedScopes, ['comments:write']);
  assert.equal(f.requests.length, 2);
  assert.deepEqual(await f.store.getTokens(), before);
});

test('whoami identifies the API origin when no login is stored', async t => {
  let f = await fixture(t, () =>
    assert.fail('An empty login must not call the API')
  );
  let result = await f.run(['whoami', '--json']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(data(result), { authenticated: false, apiUrl: f.apiUrl });
  assert.deepEqual(f.requests, []);
});

test('whoami gives a login recovery action when its saved session is revoked', async t => {
  let f = await fixture(t, received => {
    assert.ok(
      ['/api/auth/cli/whoami', '/api/auth/cli/refresh'].includes(received.url)
    );
    return {
      status: 401,
      body: { code: 'SESSION_REVOKED', error: 'CLI session revoked.' },
    };
  });
  await saveFixtureAuth(f.home, f.apiUrl, { authorization });
  let result = await f.run(['whoami', '--json']);
  assert.equal(result.code, 1);
  assert.equal(data(result).authenticated, false);
  assert.equal(data(result).code, 'LOGIN_REQUIRED');
  assert.match(data(result).error, /vizzly login/);
});

test('an unavailable saved user store cannot block an explicit token or silently choose another identity', async t => {
  let f = await fixture(t, received => {
    assert.equal(received.headers.authorization, 'Bearer vzt_explicit');
    return {
      body: {
        projects: [],
        meta: { total: 0, limit: 50, offset: 0, hasMore: false },
      },
    };
  });
  await saveFixtureAuth(f.home, f.apiUrl);
  // The record references an unavailable external credential store; disable the
  // native boundary so this test never reads the host's real Keychain.
  await writeFile(
    getAuthStoragePath(f.apiUrl, f.home),
    JSON.stringify({
      version: 1,
      apiUrl: f.apiUrl,
      storage: 'keychain',
      authorization,
    })
  );
  let env = { VIZZLY_DISABLE_KEYCHAIN: 'true' };
  let explicit = await f.run(
    ['projects', '--token', 'vzt_explicit', '--json'],
    env
  );
  assert.equal(explicit.code, 0, explicit.stderr);
  assert.equal(data(explicit).auth.source, 'flag');
  assert.equal(f.requests.length, 1);
  for (let args of [
    ['projects', '--auth', 'user', '--json'],
    ['projects', '--json'],
  ]) {
    let selectedUser = await f.run(args, env);
    assert.equal(selectedUser.code, 1);
    assert.equal(failure(selectedUser).code, 'AUTH_STORAGE_UNAVAILABLE');
  }
  assert.equal(f.requests.length, 1);
});
