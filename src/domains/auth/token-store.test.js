import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  loadGlobalConfig,
  saveGlobalConfig,
} from '../../services/global-config.js';
import {
  clearAuthTokens,
  getAccessToken,
  getAuthTokens,
  hasValidTokens,
  saveAuthTokens,
} from './token-store.js';

let originalHome = process.env.VIZZLY_HOME;
let home;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'vizzly-token-store-'));
  process.env.VIZZLY_HOME = home;
});
afterEach(async () => {
  if (originalHome === undefined) delete process.env.VIZZLY_HOME;
  else process.env.VIZZLY_HOME = originalHome;
  await rm(home, { recursive: true, force: true });
});

test('missing access credentials are unavailable even when a refresh token exists', async () => {
  for (let config of [{}, { auth: { refreshToken: 'refresh' } }]) {
    await saveGlobalConfig(config);
    assert.equal(await getAuthTokens(), null);
    assert.equal(await hasValidTokens(), false);
    assert.equal(await getAccessToken(), null);
  }
});

test('saving credentials preserves preferences and round-trips the token contract', async () => {
  await saveGlobalConfig({ preference: 'kept' });
  let auth = {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: '2099-01-01T00:00:00.000Z',
    user: { email: 'tester@example.com' },
  };
  await saveAuthTokens({ ...auth, ignored: 'not part of the token contract' });
  assert.deepEqual(await getAuthTokens(), auth);
  assert.equal(await getAccessToken(), 'access');
  assert.deepEqual(await loadGlobalConfig(), { preference: 'kept', auth });
});

test('clearing credentials preserves other settings and makes the token unavailable', async () => {
  await saveGlobalConfig({
    preference: 'kept',
    auth: { accessToken: 'access' },
  });
  await clearAuthTokens();
  assert.deepEqual(await loadGlobalConfig(), { preference: 'kept' });
  assert.equal(await getAuthTokens(), null);
  assert.equal(await getAccessToken(), null);
});

test('saved tokens become unavailable exactly five minutes before expiry', async t => {
  let now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  for (let [remaining, valid] of [
    [-1, false],
    [5 * 60 * 1000, false],
    [5 * 60 * 1000 + 1, true],
  ]) {
    await saveAuthTokens({
      accessToken: 'access',
      expiresAt: new Date(now + remaining).toISOString(),
    });
    assert.equal(await hasValidTokens(), valid);
    assert.equal(await getAccessToken(), valid ? 'access' : null);
  }
});

test('tokens without an expiry remain available', async () => {
  await saveAuthTokens({ accessToken: 'access' });
  assert.equal(await hasValidTokens(), true);
  assert.equal(await getAccessToken(), 'access');
});

test('an invalid saved expiry does not authorize a request', async () => {
  await saveAuthTokens({ accessToken: 'access', expiresAt: 'invalid' });
  assert.equal(await hasValidTokens(), false);
  assert.equal(await getAccessToken(), null);
});
