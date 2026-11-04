import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixtureAuthorization } from '../../../tests/helpers/auth-session.js';
import {
  createAuthService,
  createUserSession,
  refresh,
} from './auth.service.js';
import { createAuthClient } from './auth-client.js';
import { createApiClient } from './cloud-client.js';
import { createTokenStore } from './token-store.js';

async function fixture(t, handle) {
  let home = await mkdtemp(join(tmpdir(), 'vizzly-auth-session-'));
  let requests = [];
  let server = createServer(async (request, response) => {
    let chunks = [];
    for await (let chunk of request) chunks.push(chunk);
    let body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : null;
    requests.push({
      path: request.url,
      method: request.method,
      authorization: request.headers.authorization,
      body,
    });
    let result = await handle(requests.at(-1), requests);
    if (result.dropConnection) {
      response.destroy();
      return;
    }
    response.writeHead(result.status || 200, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify(result.body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let apiUrl = `http://127.0.0.1:${server.address().port}`;
  let tokenStore = createTokenStore({ apiUrl, home });
  let service = createAuthService({ apiUrl, tokenStore });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  });
  let auth = {
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    expiresAt: '2999-01-01T00:00:00.000Z',
    user: { email: 'person@example.test' },
    authorization: fixtureAuthorization,
  };
  return { home, apiUrl, tokenStore, service, requests, auth };
}
function renewed() {
  return {
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    expiresIn: 900,
    authorization: fixtureAuthorization,
  };
}

for (let trigger of ['expiry', 'unauthorized']) {
  test(`user requests renew on ${trigger} and keep the consented scope metadata`, async t => {
    let f = await fixture(t, request =>
      request.path.endsWith('/refresh')
        ? { body: renewed() }
        : request.authorization === 'Bearer new-access'
          ? {
              body: {
                user: { email: 'person@example.test' },
                authorization: fixtureAuthorization,
              },
            }
          : { status: 401, body: { error: 'expired' } }
    );
    await f.tokenStore.saveTokens({
      ...f.auth,
      ...(trigger === 'expiry'
        ? { expiresAt: '2000-01-01T00:00:00.000Z' }
        : {}),
    });
    assert.equal(await f.service.hasSavedSession(), true);
    let identity = await f.service.whoami();
    assert.equal(identity.user.email, 'person@example.test');
    assert.equal(
      f.requests.filter(request => request.path.endsWith('/refresh')).length,
      1
    );
    let saved = await f.tokenStore.getTokens();
    assert.equal(saved.accessToken, 'new-access');
    assert.deepEqual(saved.authorization, fixtureAuthorization);
    assert.deepEqual(saved.user, f.auth.user);
  });
}

test('authenticated reads share refresh and write requests are never replayed', async t => {
  let f = await fixture(t, request =>
    request.path.endsWith('/refresh')
      ? { body: renewed() }
      : request.path === '/read' &&
          request.authorization === 'Bearer new-access'
        ? { body: { success: true } }
        : { status: 401, body: { error: 'expired' } }
  );
  await f.tokenStore.saveTokens(f.auth);
  assert.deepEqual(await f.service.authenticatedRequest('/read'), {
    success: true,
  });
  await assert.rejects(() =>
    f.service.authenticatedRequest('/write', { method: 'POST', body: '{}' })
  );
  assert.equal(
    f.requests.filter(request => request.path === '/write').length,
    1
  );
  assert.equal(
    f.requests.filter(request => request.path.endsWith('/refresh')).length,
    1
  );
});

test('a long-lived client renews across expiry windows without retrying repeated unauthorized responses', async t => {
  let now = Date.UTC(2026, 10, 3);
  t.mock.timers.enable({ apis: ['Date'], now });
  let rotations = 0;
  let f = await fixture(t, request => {
    if (request.path.endsWith('/refresh')) {
      rotations++;
      return {
        body: {
          ...renewed(),
          accessToken: `access-${rotations}`,
          refreshToken: `refresh-${rotations}`,
        },
      };
    }
    return request.path === '/denied'
      ? { status: 401, body: { error: 'unauthorized' } }
      : { body: { success: true } };
  });
  await f.tokenStore.saveTokens({
    ...f.auth,
    expiresAt: '2000-01-01T00:00:00.000Z',
  });
  let session = createUserSession({
    baseUrl: f.apiUrl,
    tokenStore: f.tokenStore,
  });
  let client = createApiClient({
    baseUrl: f.apiUrl,
    token: f.auth.accessToken,
    credential: { session },
  });
  assert.deepEqual(await client.request('/read'), { success: true });
  t.mock.timers.setTime(now + 16 * 60 * 1000);
  assert.deepEqual(await client.request('/read'), { success: true });
  assert.equal(rotations, 2);
  assert.deepEqual(
    f.requests
      .filter(request => request.path === '/read')
      .map(request => request.authorization),
    ['Bearer access-1', 'Bearer access-2']
  );
  assert.deepEqual(
    (await f.tokenStore.getTokens()).authorization,
    fixtureAuthorization
  );
  await assert.rejects(() => client.request('/denied'), {
    code: 'LOGIN_REQUIRED',
  });
  assert.equal(rotations, 2);
  assert.equal(
    f.requests.filter(request => request.path === '/denied').length,
    1
  );
});

for (let status of [401, 500, 429]) {
  test(`refresh HTTP ${status} preserves saved state and reports the right recovery`, async t => {
    let f = await fixture(t, () => ({
      status,
      body: { error: 'refresh failed' },
    }));
    let expired = { ...f.auth, expiresAt: '2000-01-01T00:00:00.000Z' };
    await f.tokenStore.saveTokens(expired);
    await assert.rejects(() => f.service.whoami(), {
      code: {
        401: 'LOGIN_REQUIRED',
        500: 'AUTH_REFRESH_UNCERTAIN',
        429: 'AUTH_REFRESH_UNAVAILABLE',
      }[status],
    });
    assert.deepEqual(await f.tokenStore.getTokens(), {
      ...expired,
      ...(status === 500 ? { refreshUncertain: true } : {}),
    });
    assert.equal(f.requests.length, 1);
  });
}

test('missing refresh authorization metadata is rejected without guessing permissions', async t => {
  let f = await fixture(t, () => ({
    body: { accessToken: 'new', refreshToken: 'next', expiresIn: 900 },
  }));
  let expired = { ...f.auth, expiresAt: '2000-01-01T00:00:00.000Z' };
  await f.tokenStore.saveTokens(expired);
  await assert.rejects(() => f.service.whoami(), {
    code: 'AUTH_REFRESH_UNCERTAIN',
  });
  assert.deepEqual(await f.tokenStore.getTokens(), {
    ...expired,
    refreshUncertain: true,
  });
});

test('a dropped committed refresh response is never replayed by a fresh service', async t => {
  let currentRefreshToken = 'old-refresh';
  let f = await fixture(t, request => {
    assert.equal(request.path, '/api/auth/cli/refresh');
    if (request.body.refreshToken !== currentRefreshToken) {
      return {
        status: 401,
        body: {
          error: 'Refresh token was reused.',
          code: 'REFRESH_TOKEN_REUSED',
        },
      };
    }
    currentRefreshToken = 'new-refresh';
    return { dropConnection: true };
  });
  let expired = { ...f.auth, expiresAt: '2000-01-01T00:00:00.000Z' };
  await f.tokenStore.saveTokens(expired);

  await assert.rejects(() => f.service.whoami(), {
    code: 'AUTH_REFRESH_UNCERTAIN',
  });
  assert.equal(currentRefreshToken, 'new-refresh');
  assert.equal((await f.tokenStore.getTokens()).refreshUncertain, true);

  let freshStore = createTokenStore({ apiUrl: f.apiUrl, home: f.home });
  let freshService = createAuthService({
    apiUrl: f.apiUrl,
    tokenStore: freshStore,
  });
  await assert.rejects(() => freshService.whoami(), {
    code: 'AUTH_REFRESH_UNCERTAIN',
  });
  assert.equal(f.requests.length, 1);
  await assert.rejects(
    () => freshService.whoami(),
    error => {
      assert.equal(error.code, 'AUTH_REFRESH_UNCERTAIN');
      assert.match(error.message, /Run vizzly login/);
      return true;
    }
  );
});

test('a rate-limited refresh clears uncertainty and can be retried', async t => {
  let attempts = 0;
  let f = await fixture(t, request => {
    assert.equal(request.path, '/api/auth/cli/refresh');
    assert.equal(request.body.refreshToken, 'old-refresh');
    attempts++;
    return attempts === 1
      ? {
          status: 429,
          body: {
            error: 'Too many authentication attempts.',
            retryAfter: 1,
          },
        }
      : { body: renewed() };
  });
  await f.tokenStore.saveTokens(f.auth);
  let client = createAuthClient({ baseUrl: f.apiUrl });

  await assert.rejects(() => refresh(client, f.tokenStore), {
    code: 'RATE_LIMIT_ERROR',
  });
  assert.equal((await f.tokenStore.getTokens()).refreshUncertain, undefined);
  await refresh(client, f.tokenStore);

  assert.equal(attempts, 2);
  assert.equal((await f.tokenStore.getTokens()).refreshToken, 'new-refresh');
  assert.equal((await f.tokenStore.getTokens()).refreshUncertain, undefined);
});

test('unscoped legacy records require fresh browser consent before any request', async t => {
  let f = await fixture(t, () => {
    assert.fail('legacy session sent a request');
  });
  await f.tokenStore.saveTokens({
    accessToken: 'legacy',
    refreshToken: 'legacy-refresh',
  });
  assert.equal(await f.service.hasSavedSession(), true);
  await assert.rejects(() => f.service.whoami(), { code: 'LOGIN_REQUIRED' });
  assert.equal(f.requests.length, 0);
});

test('logout revokes with the refresh credential and clears the selected origin even after failure', async t => {
  let f = await fixture(t, () => ({ status: 500, body: { error: 'offline' } }));
  await f.tokenStore.saveTokens(f.auth);
  await f.service.logout();
  assert.equal(await f.tokenStore.getTokens(), null);
  assert.equal(f.requests[0].authorization, undefined);
  assert.deepEqual(f.requests[0].body, { refreshToken: f.auth.refreshToken });
});

test('device login sends the requested scope and stores the server authorization', async t => {
  let f = await fixture(t, () => ({ body: { device_code: 'device' } }));
  await f.service.initiateDeviceFlow({ scope: 'read' });
  assert.deepEqual(f.requests[0].body, {
    client_id: 'vizzly-cli',
    scope: 'read',
  });
  await f.service.completeDeviceFlow({ ...renewed(), user: f.auth.user });
  assert.deepEqual(
    (await f.tokenStore.getTokens()).authorization,
    fixtureAuthorization
  );
});

test('independent CLI processes rotate once and reread the same successor', async t => {
  let f = await fixture(t, request => {
    assert.equal(request.path, '/api/auth/cli/refresh');
    assert.equal(request.body.refreshToken, 'old-refresh');
    return { body: renewed() };
  });
  await f.tokenStore.saveTokens(f.auth);
  let script = join(f.home, 'refresh.js');
  let serviceUrl = new URL('./auth.service.js', import.meta.url).href;
  let clientUrl = new URL('./auth-client.js', import.meta.url).href;
  let storeUrl = new URL('./token-store.js', import.meta.url).href;
  await writeFile(
    script,
    `import { once } from 'node:events';\nimport { refresh } from ${JSON.stringify(serviceUrl)};\nimport { createAuthClient } from ${JSON.stringify(clientUrl)};\nimport { createTokenStore } from ${JSON.stringify(storeUrl)};\nlet [apiUrl,home]=process.argv.slice(2); let store=createTokenStore({apiUrl,home}); let observed=await store.getTokens(); let go=once(process,'message'); process.send('ready'); await go; await refresh(createAuthClient({baseUrl:apiUrl}),store,{expectedAuth:observed}); process.send('done'); process.disconnect();`
  );
  let children = [0, 1].map(() =>
    fork(script, [f.apiUrl, f.home], { execArgv: [], silent: true })
  );
  t.after(() => {
    for (let child of children) child.kill();
  });
  await Promise.all(
    children.map(async child => {
      assert.equal((await once(child, 'message'))[0], 'ready');
    })
  );
  let done = children.map(child => once(child, 'message'));
  let exits = children.map(child => once(child, 'exit'));
  for (let child of children) child.send('go');
  assert.deepEqual(
    (await Promise.all(done)).map(([message]) => message),
    ['done', 'done']
  );
  assert.deepEqual(
    (await Promise.all(exits)).map(([code]) => code),
    [0, 0]
  );
  assert.equal(f.requests.length, 1);
  assert.equal((await f.tokenStore.getTokens()).refreshToken, 'new-refresh');
});
