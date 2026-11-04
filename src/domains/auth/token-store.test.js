import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fixtureAuthorization } from '../../../tests/helpers/auth-session.js';
import { createTokenStore, getAuthStoragePath } from './token-store.js';

let home;
let apiUrl = 'https://app.vizzly.dev';
let auth = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user: { email: 'tester@example.com' },
  authorization: fixtureAuthorization,
};
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'vizzly-auth-store-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function store(options = {}) {
  return createTokenStore({ apiUrl, home, ...options });
}

test('isolated homes save complete credentials in owner-only files without accessing Keychain', async () => {
  await writeFile(
    join(home, 'config.json'),
    JSON.stringify({ preference: 'kept' })
  );
  let tokens = store({
    platform: 'darwin',
    execFileFn: () => {
      assert.fail('isolated home accessed Keychain');
    },
  });
  await tokens.saveTokens(auth);
  assert.deepEqual(await tokens.getTokens(), auth);
  let filename = getAuthStoragePath(apiUrl, home);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal((await stat(join(home, 'auth'))).mode & 0o777, 0o700);
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).storage, 'file');
  await tokens.clearTokens();
  assert.equal(await tokens.getTokens(), null);
  assert.deepEqual(
    JSON.parse(await readFile(join(home, 'config.json'), 'utf8')),
    { preference: 'kept' }
  );
});

test('sessions belong to a normalized API origin and one Vizzly home', async () => {
  await store().saveTokens(auth);
  assert.deepEqual(await store({ apiUrl: `${apiUrl}/api/` }).getTokens(), auth);
  assert.equal(
    await store({ apiUrl: 'https://staging.vizzly.dev' }).getTokens(),
    null
  );
  assert.equal(await store({ home: join(home, 'other') }).getTokens(), null);
  await store({ apiUrl: 'https://staging.vizzly.dev' }).saveTokens({
    ...auth,
    accessToken: 'staging',
  });
  assert.equal((await store().getTokens()).accessToken, 'access');
  await store().clearTokens();
  assert.equal(
    (await store({ apiUrl: 'https://staging.vizzly.dev' }).getTokens())
      .accessToken,
    'staging'
  );
});

test('old global credentials are preserved but never inferred to belong to an origin', async () => {
  let legacy = { preference: 'kept', auth: { ...auth, apiUrl } };
  await writeFile(join(home, 'config.json'), JSON.stringify(legacy));
  assert.equal(await store().getTokens(), null);
  assert.equal(
    await store({ apiUrl: 'https://staging.vizzly.dev' }).getTokens(),
    null
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(home, 'config.json'), 'utf8')),
    legacy
  );
});

test('atomic replacements never expose partial credential JSON', async () => {
  let tokens = store();
  await tokens.saveTokens(auth);
  await Promise.all(
    Array.from({ length: 24 }, async (_, index) => {
      await tokens.saveTokens({ ...auth, accessToken: `access-${index}` });
      let saved = await tokens.getTokens();
      assert.match(saved.accessToken, /^access-/);
      assert.deepEqual(saved.authorization, fixtureAuthorization);
    })
  );
  assert.equal(
    (await stat(getAuthStoragePath(apiUrl, home))).mode & 0o777,
    0o600
  );
});

test('refresh uncertainty survives reload and a successful replacement clears it', async () => {
  let tokens = store();
  await tokens.saveTokens(auth);
  await tokens.markRefreshUncertain();

  let reloaded = store();
  assert.deepEqual(await reloaded.getTokens(), {
    ...auth,
    refreshUncertain: true,
  });
  assert.equal(
    JSON.parse(await readFile(getAuthStoragePath(apiUrl, home), 'utf8'))
      .refreshUncertain,
    true
  );

  await reloaded.saveTokens({
    ...auth,
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
  });
  assert.equal((await tokens.getTokens()).refreshUncertain, undefined);
  assert.equal(
    JSON.parse(await readFile(getAuthStoragePath(apiUrl, home), 'utf8'))
      .refreshUncertain,
    undefined
  );
});

test('corrupt or origin-mismatched credential files fail without another identity fallback', async () => {
  await store().saveTokens(auth);
  let filename = getAuthStoragePath(apiUrl, home);
  for (let content of [
    '{broken',
    JSON.stringify({
      apiUrl: 'https://other.vizzly.dev',
      storage: 'file',
      ...auth,
    }),
  ]) {
    await writeFile(filename, content);
    await assert.rejects(() => store().getTokens(), {
      code: 'AUTH_STORAGE_UNAVAILABLE',
    });
  }
});

test('Keychain credentials leave only metadata on disk and unavailable native storage fails closed', async () => {
  let secret;
  let locked = false;
  let commands = [];
  let execFileFn = async (_command, args, options) => {
    assert.equal(options.timeout, 30000);
    commands.push(args[0]);
    if (locked) throw new Error('locked');
    if (args[0] === 'add-generic-password')
      secret = args[args.indexOf('-w') + 1];
    if (args[0] === 'delete-generic-password') secret = undefined;
    return { stdout: args[0] === 'find-generic-password' ? secret : '' };
  };
  let tokens = store({
    platform: 'darwin',
    storage: 'keychain',
    env: {},
    execFileFn,
  });
  await tokens.saveTokens(auth);
  assert.deepEqual(await tokens.getTokens(), auth);
  await tokens.markRefreshUncertain();
  assert.equal((await tokens.getTokens()).refreshUncertain, true);
  let disk = JSON.parse(
    await readFile(getAuthStoragePath(apiUrl, home), 'utf8')
  );
  assert.equal(disk.storage, 'keychain');
  assert.equal(disk.refreshUncertain, true);
  assert.equal(disk.accessToken, undefined);
  assert.equal(disk.refreshToken, undefined);
  assert.deepEqual(disk.authorization, fixtureAuthorization);
  assert.equal(commands.includes('delete-generic-password'), false);
  await tokens.saveTokens({
    ...auth,
    accessToken: 'renewed-access',
    refreshToken: 'renewed-refresh',
  });
  assert.equal((await tokens.getTokens()).refreshUncertain, undefined);
  locked = true;
  await assert.rejects(() => tokens.getTokens(), {
    code: 'AUTH_STORAGE_UNAVAILABLE',
  });
  assert.equal(
    JSON.parse(await readFile(getAuthStoragePath(apiUrl, home), 'utf8'))
      .storage,
    'keychain'
  );
});

test('automatic native-storage failure uses an explicit owner-only file record', async () => {
  let tokens = store({
    platform: 'darwin',
    storage: 'auto',
    env: {},
    execFileFn: async () => {
      throw new Error('unavailable');
    },
  });
  await tokens.saveTokens(auth);
  assert.deepEqual(await tokens.getTokens(), auth);
  assert.equal(
    JSON.parse(await readFile(getAuthStoragePath(apiUrl, home), 'utf8'))
      .storage,
    'file'
  );
  assert.equal(
    (await stat(getAuthStoragePath(apiUrl, home))).mode & 0o777,
    0o600
  );
});
