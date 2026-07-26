import {
  getApiOrigin,
  getCredentialState,
  resolveEnvironment,
  setCredentialState,
} from './environment-profile.js';
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
  let origin = getApiOrigin(apiUrl || 'https://app.vizzly.dev');
  return `${origin}|${organizationSlug}/${projectSlug}`;
}

function getProjectLinkConfig(config, origin) {
  let credentials = getCredentialState(config, origin);
  return credentials.projectLink || { active: null, links: {} };
}

function setProjectLinkConfig(config, origin, projectLink) {
  let credentials = getCredentialState(config, origin);
  return setCredentialState(config, origin, {
    ...credentials,
    projectLink,
  });
}

export async function saveProjectLink(link, deps = {}) {
  let {
    loadConfig = loadGlobalConfig,
    saveConfig = saveGlobalConfig,
    saveSecret = defaultSaveSecret,
    now = () => new Date(),
  } = deps;

  let config = await loadConfig();
  let environment = resolveEnvironment({ config, apiUrl: link.apiUrl });
  let projectLink = getProjectLinkConfig(config, environment.origin);
  let account = buildProjectLinkAccount({
    ...link,
    apiUrl: environment.origin,
  });
  let storedInKeychain = await saveSecret(account, link.token);

  projectLink.active = account;
  projectLink.links = {
    ...projectLink.links,
    [account]: {
      apiUrl: environment.apiUrl,
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

  let nextConfig = setProjectLinkConfig(
    config,
    environment.origin,
    projectLink
  );
  await saveConfig(nextConfig);

  return {
    ...projectLink.links[account],
    account,
    token: link.token,
  };
}

export async function getActiveProjectLink(options = {}, deps = {}) {
  let { loadConfig = loadGlobalConfig, getSecret = defaultGetSecret } = deps;

  let config = await loadConfig();
  let environment = resolveEnvironment({
    config,
    env: options.env,
    apiUrl: options.apiUrl,
  });
  let projectLink = getProjectLinkConfig(config, environment.origin);
  let account = options.account || projectLink.active;
  let link = account ? projectLink.links?.[account] : null;

  if (
    !link &&
    options.apiUrl &&
    options.organizationSlug &&
    options.projectSlug
  ) {
    account = buildProjectLinkAccount({
      ...options,
      apiUrl: environment.origin,
    });
    link = projectLink.links?.[account] || null;
  }

  if (!link) {
    return null;
  }

  if (link.apiUrl && getApiOrigin(link.apiUrl) !== environment.origin) {
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
  let environment = resolveEnvironment({
    config,
    env: deps.env,
    apiUrl: deps.apiUrl,
  });
  let projectLink = getProjectLinkConfig(config, environment.origin);
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
  let nextConfig = setProjectLinkConfig(
    config,
    environment.origin,
    projectLink
  );
  await saveConfig(nextConfig);

  return {
    ...link,
    account,
  };
}
