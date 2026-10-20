import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createAuthRouter } from '../../../src/server/routers/auth.js';
import { createAuthService } from '../../../src/services/auth-service.js';
import {
  clearAuthTokens,
  getAuthTokens,
  saveAuthTokens,
} from '../../../src/utils/global-config.js';

let upstream;
let local;
let base;
let response;
let testHome;
let originalHome = process.env.VIZZLY_HOME;
let paths;
let authorizations;

before(async () => {
  testHome = await mkdtemp(join(tmpdir(), 'vizzly-auth-router-'));
  process.env.VIZZLY_HOME = testHome;
  upstream = createServer((req, res) => {
    paths.push(req.url);
    authorizations.push(req.headers.authorization);
    res.writeHead(response.status, {
      'Content-Type': 'application/json',
      ...response.headers,
    });
    res.end(JSON.stringify(response.body));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  let service = createAuthService({
    apiUrl: `http://127.0.0.1:${upstream.address().port}`,
  });
  let router = createAuthRouter({ authService: service });
  local = createServer(async (req, res) => {
    if (!(await router(req, res, new URL(req.url, 'http://local').pathname))) {
      res.writeHead(404).end();
    }
  });
  local.listen(0, '127.0.0.1');
  await once(local, 'listening');
  base = `http://127.0.0.1:${local.address().port}`;
});
beforeEach(async () => {
  await clearAuthTokens();
  paths = [];
  authorizations = [];
  response = { status: 200, body: {} };
});
after(async () => {
  for (let server of [local, upstream].filter(Boolean)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (originalHome === undefined) delete process.env.VIZZLY_HOME;
  else process.env.VIZZLY_HOME = originalHome;
  await rm(testHome, { recursive: true, force: true });
});

async function post(path, body = {}) {
  let result = await fetch(`${base}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: result.status,
    headers: result.headers,
    body: await result.json(),
  };
}

test('initiation preserves supported field aliases and complete verification URL', async () => {
  for (let flow of [
    {
      device_code: 'device',
      user_code: 'CODE',
      verification_uri: 'https://auth.test/cli/authorize',
      expires_in: 600,
    },
    {
      deviceCode: 'device',
      userCode: 'CODE',
      verificationUri: 'https://auth.test/cli/authorize',
      expiresIn: 600,
    },
    {
      device_code: 'device',
      user_code: 'CODE',
      verification_uri: 'https://auth.test/cli/authorize',
      verification_uri_complete:
        'https://auth.test/cli/authorize?code=CODE&app=cli',
      expires_in: 600,
    },
    {
      deviceCode: 'device',
      userCode: 'CODE',
      verificationUri: 'https://auth.test/cli/authorize',
      verificationUriComplete:
        'https://auth.test/cli/authorize?code=CODE&app=cli',
      expiresIn: 600,
    },
  ]) {
    response.body = { ...flow, interval: 5 };
    let started = await post('login');
    assert.equal(started.status, 200);
    assert.equal(started.body.deviceCode, 'device');
    assert.equal(started.body.userCode, 'CODE');
    assert.equal(started.body.expiresIn, 600);
    assert.equal(
      started.body.verificationUriComplete,
      flow.verification_uri_complete ||
        flow.verificationUriComplete ||
        'https://auth.test/cli/authorize?code=CODE'
    );
  }
});

test('expected outcomes use protocol codes rather than the error wording', async () => {
  for (let [code, status, expected] of [
    ['AUTHORIZATION_PENDING', 400, 'pending'],
    ['ACCESS_DENIED', 401, 'denied'],
    ['EXPIRED_TOKEN', 401, 'expired'],
    ['INVALID_DEVICE_CODE', 400, 'invalid'],
  ]) {
    response = {
      status,
      body: { error: 'An unrelated human-readable sentence', code },
    };
    let result = await post('poll', { deviceCode: 'device' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: expected });
    assert.equal(await getAuthTokens(), null);
  }
  assert.ok(paths.every(path => path === '/api/auth/cli/device/poll'));
});

test('upstream throttling retains status, code and retry timing through both endpoints', async () => {
  response = {
    status: 429,
    headers: { 'Retry-After': '73' },
    body: { error: 'Slow down', code: 'THROTTLED', retryAfter: 60 },
  };
  for (let path of ['login', 'poll']) {
    let result = await post(path, { deviceCode: 'device' });
    assert.equal(result.status, 429);
    assert.equal(result.body.code, 'THROTTLED');
    assert.equal(result.body.retryAfter, 73);
    assert.equal(result.headers.get('retry-after'), '73');
  }
  assert.equal(await getAuthTokens(), null);
});

test('token aliases save normalized credentials without returning them to the browser', async () => {
  for (let tokens of [
    { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
    { access_token: 'access', refresh_token: 'refresh', expires_in: 900 },
  ]) {
    response.body = { tokens, user: { username: 'test-user' } };
    let result = await post('poll', { deviceCode: 'device' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      status: 'complete',
      user: { username: 'test-user' },
    });
    let saved = await getAuthTokens();
    assert.equal(saved.accessToken, 'access');
    assert.equal(saved.refreshToken, 'refresh');
    assert.ok(Date.parse(saved.expiresAt) > Date.now());
    assert.equal(JSON.stringify(result.body).includes('refresh'), false);
  }
});

test('unknown successful authorization payloads fail instead of silently staying pending', async () => {
  let result = await post('poll', { deviceCode: 'device' });
  assert.equal(result.status, 500);
  assert.match(result.body.error, /Unexpected response/);
  assert.equal(await getAuthTokens(), null);
});

test('sign-out authenticates revocation and clears the local session', async () => {
  await saveAuthTokens({ accessToken: 'access', refreshToken: 'refresh' });
  response.body = { message: 'CLI logout successful' };
  let result = await post('logout');
  assert.equal(result.status, 200);
  assert.deepEqual(paths, ['/api/auth/cli/logout']);
  assert.deepEqual(authorizations, ['Bearer access']);
  assert.equal(await getAuthTokens(), null);
});
