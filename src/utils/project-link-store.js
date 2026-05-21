import { loadGlobalConfig, saveGlobalConfig } from './global-config.js';
import {
  deleteSecret as defaultDeleteSecret,
  getSecret as defaultGetSecret,
  saveSecret as defaultSaveSecret,
} from './secret-store.js';

export function buildProjectLinkAccount({
  apiUrl,
  organizationSlug,
  projectSlug,
}) {
  return `${apiUrl || 'https://app.vizzly.dev'}|${organizationSlug}/${projectSlug}`;
}

function getProjectLinkConfig(config) {
  return config.projectLink || { active: null, links: {} };
}

export async function saveProjectLink(link, deps = {}) {
  let {
    loadConfig = loadGlobalConfig,
    saveConfig = saveGlobalConfig,
    saveSecret = defaultSaveSecret,
    now = () => new Date(),
  } = deps;

  let config = await loadConfig();
  let projectLink = getProjectLinkConfig(config);
  let account = buildProjectLinkAccount(link);
  let storedInKeychain = await saveSecret(account, link.token);

  projectLink.active = account;
  projectLink.links = {
    ...projectLink.links,
    [account]: {
      apiUrl: link.apiUrl,
      organizationSlug: link.organizationSlug,
      organizationName: link.organizationName,
      projectSlug: link.projectSlug,
      projectName: link.projectName,
      tokenId: link.tokenId,
      tokenPrefix: link.tokenPrefix,
      expiresAt: link.expiresAt || null,
      createdAt: link.createdAt || now().toISOString(),
      storage: storedInKeychain ? 'keychain' : 'file',
      token: storedInKeychain ? undefined : link.token,
    },
  };

  config.projectLink = projectLink;
  await saveConfig(config);

  return {
    ...projectLink.links[account],
    account,
    token: link.token,
  };
}

export async function getActiveProjectLink(options = {}, deps = {}) {
  let { loadConfig = loadGlobalConfig, getSecret = defaultGetSecret } = deps;

  let config = await loadConfig();
  let projectLink = getProjectLinkConfig(config);
  let account = options.account || projectLink.active;
  let link = account ? projectLink.links?.[account] : null;

  if (
    !link &&
    options.apiUrl &&
    options.organizationSlug &&
    options.projectSlug
  ) {
    account = buildProjectLinkAccount(options);
    link = projectLink.links?.[account] || null;
  }

  if (!link) {
    return null;
  }

  if (options.apiUrl && link.apiUrl && link.apiUrl !== options.apiUrl) {
    return null;
  }

  let token =
    link.storage === 'keychain' ? await getSecret(account) : link.token;
  if (!token) {
    return null;
  }

  return {
    ...link,
    account,
    token,
  };
}

export async function clearActiveProjectLink(deps = {}) {
  let {
    loadConfig = loadGlobalConfig,
    saveConfig = saveGlobalConfig,
    deleteSecret = defaultDeleteSecret,
  } = deps;

  let config = await loadConfig();
  let projectLink = getProjectLinkConfig(config);
  let account = projectLink.active;

  if (!account || !projectLink.links?.[account]) {
    return null;
  }

  let link = projectLink.links[account];
  if (link.storage === 'keychain') {
    await deleteSecret(account);
  }

  delete projectLink.links[account];
  projectLink.active = null;
  config.projectLink = projectLink;
  await saveConfig(config);

  return {
    ...link,
    account,
  };
}
