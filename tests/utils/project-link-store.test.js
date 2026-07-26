import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOCAL_API_URL,
  PRODUCTION_API_URL,
} from '../../src/utils/environment-profile.js';
import {
  buildProjectLinkAccount,
  clearActiveProjectLink,
  getActiveProjectLink,
  saveProjectLink,
} from '../../src/utils/project-link-store.js';

function createConfigStore(initialConfig = {}) {
  let config = initialConfig;

  return {
    loadConfig: async () => config,
    saveConfig: async nextConfig => {
      config = nextConfig;
    },
    getConfig: () => config,
  };
}

function createLink(overrides = {}) {
  return {
    apiUrl: 'https://app.vizzly.dev',
    organizationSlug: 'vizzly',
    organizationName: 'Vizzly',
    projectSlug: 'storybook',
    projectName: 'Storybook',
    token: 'vzt_linked_secret',
    tokenId: 'token-id',
    tokenPrefix: 'vzt_lin',
    createdAt: '2026-05-20T12:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('utils/project-link-store', () => {
  it('builds stable account keys scoped to API, org, and project', () => {
    assert.strictEqual(
      buildProjectLinkAccount({
        apiUrl: 'https://app.vizzly.dev',
        organizationSlug: 'vizzly',
        projectSlug: 'storybook',
      }),
      'https://app.vizzly.dev|vizzly/storybook'
    );
  });

  it('falls back to the config file when the secure store is unavailable', async () => {
    let store = createConfigStore();
    let savedLink = await saveProjectLink(createLink(), {
      loadConfig: store.loadConfig,
      saveConfig: store.saveConfig,
      saveSecret: async () => false,
    });

    assert.strictEqual(savedLink.storage, 'file');
    assert.strictEqual(savedLink.token, 'vzt_linked_secret');

    let config = store.getConfig();
    let account = `${PRODUCTION_API_URL}|vizzly/storybook`;
    let projectLink = config.credentials[PRODUCTION_API_URL].projectLink;
    assert.strictEqual(projectLink.active, account);
    assert.strictEqual(projectLink.links[account].storage, 'file');
    assert.strictEqual(projectLink.links[account].token, 'vzt_linked_secret');

    let activeLink = await getActiveProjectLink(
      { apiUrl: 'https://app.vizzly.dev' },
      { loadConfig: store.loadConfig }
    );

    assert.strictEqual(activeLink.account, account);
    assert.strictEqual(activeLink.token, 'vzt_linked_secret');
    assert.strictEqual(activeLink.organizationSlug, 'vizzly');
    assert.strictEqual(activeLink.projectSlug, 'storybook');
  });

  it('round-trips linked project token expiration', async () => {
    let store = createConfigStore();

    await saveProjectLink(
      createLink({ expiresAt: '2026-06-01T00:00:00.000Z' }),
      {
        loadConfig: store.loadConfig,
        saveConfig: store.saveConfig,
        saveSecret: async () => false,
      }
    );

    let activeLink = await getActiveProjectLink(
      { apiUrl: 'https://app.vizzly.dev' },
      { loadConfig: store.loadConfig }
    );

    assert.strictEqual(activeLink.expiresAt, '2026-06-01T00:00:00.000Z');
  });

  it('keeps linked project tokens out of config when the secure store is available', async () => {
    let store = createConfigStore();
    let secrets = new Map();

    let savedLink = await saveProjectLink(createLink(), {
      loadConfig: store.loadConfig,
      saveConfig: store.saveConfig,
      saveSecret: async (account, token) => {
        secrets.set(account, token);
        return true;
      },
    });

    let account = `${PRODUCTION_API_URL}|vizzly/storybook`;
    let config = store.getConfig();
    let projectLink = config.credentials[PRODUCTION_API_URL].projectLink;
    assert.strictEqual(savedLink.storage, 'keychain');
    assert.strictEqual(projectLink.links[account].storage, 'keychain');
    assert.strictEqual(projectLink.links[account].token, undefined);
    assert.strictEqual(secrets.get(account), 'vzt_linked_secret');

    let activeLink = await getActiveProjectLink(
      { apiUrl: 'https://app.vizzly.dev' },
      {
        loadConfig: store.loadConfig,
        getSecret: async requestedAccount => secrets.get(requestedAccount),
      }
    );

    assert.strictEqual(activeLink.token, 'vzt_linked_secret');
  });

  it('clears the active secure-store link and deletes its saved secret', async () => {
    let account = `${PRODUCTION_API_URL}|vizzly/storybook`;
    let store = createConfigStore({
      credentials: {
        [PRODUCTION_API_URL]: {
          projectLink: {
            active: account,
            links: {
              [account]: {
                apiUrl: PRODUCTION_API_URL,
                organizationSlug: 'vizzly',
                projectSlug: 'storybook',
                storage: 'keychain',
                tokenPrefix: 'vzt_lin',
              },
            },
          },
        },
      },
    });
    let deletedAccounts = [];

    let clearedLink = await clearActiveProjectLink({
      loadConfig: store.loadConfig,
      saveConfig: store.saveConfig,
      deleteSecret: async deletedAccount => {
        deletedAccounts.push(deletedAccount);
        return true;
      },
    });

    assert.strictEqual(clearedLink.account, account);
    assert.deepStrictEqual(deletedAccounts, [account]);
    let projectLink =
      store.getConfig().credentials[PRODUCTION_API_URL].projectLink;
    assert.strictEqual(projectLink.active, null);
    assert.deepStrictEqual(projectLink.links, {});
  });

  it('keeps one active project credential per API origin across restarts', async () => {
    let store = createConfigStore();

    await saveProjectLink(createLink({ token: 'production-project' }), {
      loadConfig: store.loadConfig,
      saveConfig: store.saveConfig,
      saveSecret: async () => false,
    });
    await saveProjectLink(
      createLink({
        apiUrl: LOCAL_API_URL,
        token: 'local-project',
        tokenPrefix: 'vzt_loc',
      }),
      {
        loadConfig: store.loadConfig,
        saveConfig: store.saveConfig,
        saveSecret: async () => false,
      }
    );

    let productionLink = await getActiveProjectLink(
      { apiUrl: PRODUCTION_API_URL },
      { loadConfig: store.loadConfig }
    );
    let localLink = await getActiveProjectLink(
      { apiUrl: LOCAL_API_URL },
      { loadConfig: store.loadConfig }
    );

    assert.strictEqual(productionLink.token, 'production-project');
    assert.strictEqual(localLink.token, 'local-project');
  });
});
