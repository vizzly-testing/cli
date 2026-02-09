import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  clearAuthTokens,
  clearGlobalConfig,
  getAccessToken,
  getAuthTokens,
  getGlobalConfigDir,
  getGlobalConfigPath,
  hasValidTokens,
  loadGlobalConfig,
  saveAuthTokens,
  saveGlobalConfig,
} from '../../src/utils/global-config.js';

describe('utils/global-config', () => {
  let testDir = join(process.cwd(), '.test-global-config');
  let originalVizzlyHome = process.env.VIZZLY_HOME;

  beforeEach(() => {
    // Use test directory for all global config operations
    process.env.VIZZLY_HOME = testDir;

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Restore original VIZZLY_HOME
    if (originalVizzlyHome) {
      process.env.VIZZLY_HOME = originalVizzlyHome;
    } else {
      delete process.env.VIZZLY_HOME;
    }
  });

  describe('getGlobalConfigDir', () => {
    it('returns VIZZLY_HOME when set', () => {
      process.env.VIZZLY_HOME = '/custom/path';
      let dir = getGlobalConfigDir();

      assert.strictEqual(dir, '/custom/path');

      // Restore
      process.env.VIZZLY_HOME = testDir;
    });
  });

  describe('getGlobalConfigPath', () => {
    it('returns config.json path within config dir', () => {
      let path = getGlobalConfigPath();

      assert.ok(path.includes(testDir));
      assert.ok(path.includes('config.json'));
    });
  });

  describe('loadGlobalConfig', () => {
    it('returns empty object when config does not exist', async () => {
      let config = await loadGlobalConfig();

      assert.deepStrictEqual(config, {});
    });

    it('loads config from file', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({ key: 'value' })
      );

      let config = await loadGlobalConfig();

      assert.strictEqual(config.key, 'value');
    });

    it('returns empty object for invalid JSON', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'config.json'), 'not valid json');

      let config = await loadGlobalConfig();

      assert.deepStrictEqual(config, {});
    });
  });

  describe('saveGlobalConfig', () => {
    it('creates directory and saves config', async () => {
      await saveGlobalConfig({ test: 'value' });

      let content = readFileSync(join(testDir, 'config.json'), 'utf-8');
      let config = JSON.parse(content);

      assert.strictEqual(config.test, 'value');
    });

    it('overwrites existing config', async () => {
      await saveGlobalConfig({ first: 'value' });
      await saveGlobalConfig({ second: 'value' });

      let content = readFileSync(join(testDir, 'config.json'), 'utf-8');
      let config = JSON.parse(content);

      assert.strictEqual(config.first, undefined);
      assert.strictEqual(config.second, 'value');
    });
  });

  describe('clearGlobalConfig', () => {
    it('clears all config', async () => {
      await saveGlobalConfig({ key: 'value', auth: { token: '123' } });
      await clearGlobalConfig();

      let config = await loadGlobalConfig();

      assert.deepStrictEqual(config, {});
    });
  });

  describe('getAuthTokens', () => {
    it('returns null when no auth exists', async () => {
      let tokens = await getAuthTokens();

      assert.strictEqual(tokens, null);
    });

    it('returns null when auth has no accessToken', async () => {
      await saveGlobalConfig({ auth: { refreshToken: 'xyz' } });

      let tokens = await getAuthTokens();

      assert.strictEqual(tokens, null);
    });

    it('returns auth tokens when they exist', async () => {
      await saveGlobalConfig({
        auth: {
          accessToken: 'abc123',
          refreshToken: 'xyz789',
          expiresAt: '2025-01-01T00:00:00Z',
        },
      });

      let tokens = await getAuthTokens();

      assert.strictEqual(tokens.accessToken, 'abc123');
      assert.strictEqual(tokens.refreshToken, 'xyz789');
    });
  });

  describe('saveAuthTokens', () => {
    it('saves auth tokens to config', async () => {
      await saveAuthTokens({
        accessToken: 'token123',
        refreshToken: 'refresh456',
        expiresAt: '2025-06-01T00:00:00Z',
        user: { email: 'test@example.com' },
      });

      let config = await loadGlobalConfig();

      assert.strictEqual(config.auth.accessToken, 'token123');
      assert.strictEqual(config.auth.refreshToken, 'refresh456');
      assert.strictEqual(config.auth.expiresAt, '2025-06-01T00:00:00Z');
      assert.strictEqual(config.auth.user.email, 'test@example.com');
    });

    it('preserves other config when saving tokens', async () => {
      await saveGlobalConfig({ other: 'data' });
      await saveAuthTokens({ accessToken: 'token' });

      let config = await loadGlobalConfig();

      assert.strictEqual(config.other, 'data');
      assert.strictEqual(config.auth.accessToken, 'token');
    });
  });

  describe('clearAuthTokens', () => {
    it('removes auth from config', async () => {
      await saveAuthTokens({ accessToken: 'token' });
      await clearAuthTokens();

      let config = await loadGlobalConfig();

      assert.strictEqual(config.auth, undefined);
    });

    it('preserves other config', async () => {
      await saveGlobalConfig({
        other: 'data',
        auth: { accessToken: 'token' },
      });
      await clearAuthTokens();

      let config = await loadGlobalConfig();

      assert.strictEqual(config.other, 'data');
      assert.strictEqual(config.auth, undefined);
    });
  });

  describe('hasValidTokens', () => {
    it('returns false when no tokens', async () => {
      let valid = await hasValidTokens();

      assert.strictEqual(valid, false);
    });

    it('returns false when token is expired', async () => {
      let expiredDate = new Date(Date.now() - 10000).toISOString();
      await saveAuthTokens({
        accessToken: 'token',
        expiresAt: expiredDate,
      });

      let valid = await hasValidTokens();

      assert.strictEqual(valid, false);
    });

    it('returns false when token expires within buffer', async () => {
      // Token expires in 2 minutes (within 5 minute buffer)
      let nearExpiry = new Date(Date.now() + 2 * 60 * 1000).toISOString();
      await saveAuthTokens({
        accessToken: 'token',
        expiresAt: nearExpiry,
      });

      let valid = await hasValidTokens();

      assert.strictEqual(valid, false);
    });

    it('returns true when token is valid', async () => {
      // Token expires in 1 hour
      let futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await saveAuthTokens({
        accessToken: 'token',
        expiresAt: futureDate,
      });

      let valid = await hasValidTokens();

      assert.strictEqual(valid, true);
    });

    it('returns true when no expiresAt (never expires)', async () => {
      await saveAuthTokens({
        accessToken: 'token',
      });

      let valid = await hasValidTokens();

      assert.strictEqual(valid, true);
    });
  });

  describe('getAccessToken', () => {
    it('returns null when no tokens', async () => {
      let token = await getAccessToken();

      assert.strictEqual(token, null);
    });

    it('returns access token when exists', async () => {
      await saveAuthTokens({ accessToken: 'my-token' });

      let token = await getAccessToken();

      assert.strictEqual(token, 'my-token');
    });
  });
});
