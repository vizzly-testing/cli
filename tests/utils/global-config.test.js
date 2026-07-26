import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  LOCAL_API_URL,
  PRODUCTION_API_URL,
} from '../../src/utils/environment-profile.js';
import {
  clearAuthTokens,
  clearGlobalConfig,
  expandHomePath,
  getAccessToken,
  getAuthTokens,
  getGlobalConfigDir,
  getGlobalConfigPath,
  hasValidTokens,
  loadGlobalConfig,
  loadGlobalConfigSync,
  saveAuthTokens,
  saveGlobalConfig,
} from '../../src/utils/global-config.js';
import { getActiveProjectLink } from '../../src/utils/project-link-store.js';

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

    it('expands shell-style home paths from dotenv files', () => {
      process.env.VIZZLY_HOME = '$HOME/.vizzly.dev';
      let dir = getGlobalConfigDir();

      assert.strictEqual(dir.endsWith('/.vizzly.dev'), true);
      assert.strictEqual(dir.includes('$HOME'), false);

      process.env.VIZZLY_HOME = testDir;
    });
  });

  describe('expandHomePath', () => {
    it('expands tilde and HOME prefixes without changing other paths', () => {
      assert.strictEqual(
        expandHomePath('$HOME/.vizzly'),
        join(homedir(), '.vizzly')
      );
      assert.strictEqual(
        expandHomePath('~/.vizzly'),
        join(homedir(), '.vizzly')
      );
      assert.strictEqual(expandHomePath('/tmp/vizzly'), '/tmp/vizzly');
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

    it('fails loudly when synchronous environment selection reads corrupt config', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'config.json'), 'not valid json');

      assert.throws(
        () => loadGlobalConfigSync(),
        /Global Vizzly config is corrupted/
      );
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

    it('cuts released auth over to production once without exposing it locally', async () => {
      await saveGlobalConfig({
        auth: {
          accessToken: 'released-production-token',
          refreshToken: 'released-refresh-token',
        },
      });

      let localTokens = await getAuthTokens({ apiUrl: LOCAL_API_URL });
      let productionTokens = await getAuthTokens({
        apiUrl: PRODUCTION_API_URL,
      });
      let persistedConfig = JSON.parse(
        readFileSync(join(testDir, 'config.json'), 'utf-8')
      );

      assert.strictEqual(localTokens, null);
      assert.strictEqual(
        productionTokens.accessToken,
        'released-production-token'
      );
      assert.strictEqual(persistedConfig.auth, undefined);
      assert.strictEqual(
        persistedConfig.credentials[PRODUCTION_API_URL].auth.accessToken,
        'released-production-token'
      );
    });

    it('partitions released project links without changing Keychain accounts', async () => {
      let productionAccount = 'https://app.vizzly.dev|vizzly/storybook';
      let localAccount = 'http://localhost:3000|vizzly/storybook';
      await saveGlobalConfig({
        projectLink: {
          active: localAccount,
          links: {
            [productionAccount]: {
              apiUrl: PRODUCTION_API_URL,
              organizationSlug: 'vizzly',
              projectSlug: 'storybook',
              storage: 'keychain',
              tokenPrefix: 'vzt_prod',
            },
            [localAccount]: {
              apiUrl: LOCAL_API_URL,
              organizationSlug: 'vizzly',
              projectSlug: 'storybook',
              storage: 'keychain',
              tokenPrefix: 'vzt_local',
            },
          },
        },
      });

      let config = await loadGlobalConfig();
      let secrets = new Map([
        [productionAccount, 'vzt_production_secret'],
        [localAccount, 'vzt_local_secret'],
      ]);
      let productionLink = await getActiveProjectLink(
        { apiUrl: PRODUCTION_API_URL },
        { getSecret: async account => secrets.get(account) || null }
      );
      let localLink = await getActiveProjectLink(
        { apiUrl: LOCAL_API_URL },
        { getSecret: async account => secrets.get(account) || null }
      );
      let productionProjectLink =
        config.credentials[PRODUCTION_API_URL].projectLink;
      let localProjectLink = config.credentials[LOCAL_API_URL].projectLink;
      assert.strictEqual(productionProjectLink.active, productionAccount);
      assert.strictEqual(
        productionProjectLink.links[productionAccount].apiUrl,
        PRODUCTION_API_URL
      );
      assert.strictEqual(localProjectLink.active, localAccount);
      assert.strictEqual(
        localProjectLink.links[localAccount].apiUrl,
        LOCAL_API_URL
      );
      assert.strictEqual(productionLink.token, 'vzt_production_secret');
      assert.strictEqual(localLink.token, 'vzt_local_secret');

      let persistedConfig = JSON.parse(
        readFileSync(join(testDir, 'config.json'), 'utf-8')
      );
      assert.strictEqual(persistedConfig.projectLink, undefined);
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

      let auth = config.credentials[PRODUCTION_API_URL].auth;
      assert.strictEqual(auth.accessToken, 'token123');
      assert.strictEqual(auth.refreshToken, 'refresh456');
      assert.strictEqual(auth.expiresAt, '2025-06-01T00:00:00Z');
      assert.strictEqual(auth.user.email, 'test@example.com');
    });

    it('preserves other config when saving tokens', async () => {
      await saveGlobalConfig({ other: 'data' });
      await saveAuthTokens({ accessToken: 'token' });

      let config = await loadGlobalConfig();

      assert.strictEqual(config.other, 'data');
      assert.strictEqual(
        config.credentials[PRODUCTION_API_URL].auth.accessToken,
        'token'
      );
    });

    it('keeps production and local user auth isolated in one Vizzly home', async () => {
      await saveAuthTokens(
        { accessToken: 'production-user' },
        { apiUrl: PRODUCTION_API_URL }
      );
      await saveAuthTokens(
        { accessToken: 'local-user' },
        { apiUrl: LOCAL_API_URL }
      );

      assert.strictEqual(
        (await getAuthTokens({ apiUrl: PRODUCTION_API_URL })).accessToken,
        'production-user'
      );
      assert.strictEqual(
        (await getAuthTokens({ apiUrl: LOCAL_API_URL })).accessToken,
        'local-user'
      );
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
