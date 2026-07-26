export let PRODUCTION_API_URL = 'https://app.vizzly.dev';
export let LOCAL_API_URL = 'http://localhost:3000';
export let ENVIRONMENT_NAMES = ['production', 'local'];

/**
 * Keep equivalent API base URLs from creating different credential identities.
 *
 * @param {string} apiUrl - API base URL selected by the command.
 * @returns {string} Stable API base URL without query, hash, or trailing slash.
 */
export function normalizeApiUrl(apiUrl) {
  let url = new URL(apiUrl);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

/**
 * Use the network origin as the security boundary for stored credentials.
 *
 * API base paths still belong in request URLs, but they must not create
 * parallel Keychain identities for the same origin.
 *
 * @param {string} apiUrl - Normalized or user-provided API base URL.
 * @returns {string} URL origin used to partition credentials.
 */
export function getApiOrigin(apiUrl) {
  return new URL(normalizeApiUrl(apiUrl)).origin;
}

/**
 * Give known origins stable human names without restricting explicit URLs.
 *
 * @param {string} apiUrl - API URL to identify.
 * @returns {'production'|'local'|'custom'} Display environment name.
 */
export function getEnvironmentName(apiUrl) {
  let origin = getApiOrigin(apiUrl);

  if (origin === PRODUCTION_API_URL) {
    return 'production';
  }

  if (origin === LOCAL_API_URL) {
    return 'local';
  }

  return 'custom';
}

/**
 * Resolve the API URL and credential origin as one decision.
 *
 * Keeping these values together prevents a persisted local selection, an
 * explicit URL, and the production default from choosing credentials
 * independently.
 *
 * @param {Object} options - Config, process environment, and optional URL.
 * @returns {Object} Selected environment, API base, origin, and source.
 */
export function resolveEnvironment({
  config = {},
  env = process.env,
  apiUrl,
} = {}) {
  if (apiUrl || env.VIZZLY_API_URL) {
    let resolvedApiUrl = normalizeApiUrl(apiUrl || env.VIZZLY_API_URL);
    let origin = getApiOrigin(resolvedApiUrl);
    return {
      name: getEnvironmentName(resolvedApiUrl),
      apiUrl: resolvedApiUrl,
      origin,
      source: apiUrl ? 'explicit' : 'environment-variable',
    };
  }

  let selectedName = config.environment?.active || 'production';
  if (!ENVIRONMENT_NAMES.includes(selectedName)) {
    throw new Error(
      `Unknown Vizzly environment "${selectedName}". Use "production" or "local".`
    );
  }
  let selectedApiUrl =
    selectedName === 'local' ? LOCAL_API_URL : PRODUCTION_API_URL;
  let origin = getApiOrigin(selectedApiUrl);

  return {
    name: selectedName,
    apiUrl: origin,
    origin,
    source: config.environment?.active ? 'global-config' : 'default',
  };
}

/**
 * Read only credentials owned by the selected API origin.
 *
 * @param {Object} config - Global Vizzly configuration.
 * @param {string} origin - API origin that will receive the credential.
 * @returns {Object} Origin-scoped credential state.
 */
export function getCredentialState(config, origin) {
  return config.credentials?.[getApiOrigin(origin)] || {};
}

/**
 * Replace one origin bucket without disturbing credentials for other origins.
 *
 * @param {Object} config - Global Vizzly configuration.
 * @param {string} origin - API origin that owns the state.
 * @param {Object} credentialState - Complete state for that origin.
 * @returns {Object} Updated immutable global configuration.
 */
export function setCredentialState(config, origin, credentialState) {
  let normalizedOrigin = getApiOrigin(origin);

  return {
    ...config,
    credentials: {
      ...config.credentials,
      [normalizedOrigin]: credentialState,
    },
  };
}

/**
 * Persist an explicit environment choice without touching either credential
 * bucket.
 *
 * @param {Object} config - Global Vizzly configuration.
 * @param {'production'|'local'} name - Environment to select.
 * @returns {Object} Updated immutable global configuration.
 */
export function selectEnvironment(config, name) {
  if (!ENVIRONMENT_NAMES.includes(name)) {
    throw new Error(
      `Unknown Vizzly environment "${name}". Use "production" or "local".`
    );
  }

  return {
    ...config,
    environment: {
      ...config.environment,
      active: name,
    },
  };
}

/**
 * Cut released root credentials over to origin-scoped storage once.
 *
 * User auth belonged to the historical production default. Project links
 * already recorded their API URL, so they can be partitioned without changing
 * opaque Keychain account IDs or keeping a permanent legacy read path.
 *
 * This is a temporary external-config cutover, not part of the permanent
 * environment architecture. Delete this helper and its legacy-shape tests once
 * the supported CLI upgrade window no longer includes releases that wrote
 * root-level `auth` or `projectLink`.
 *
 * @param {Object} config - Parsed global configuration.
 * @returns {{config: Object, changed: boolean}} Cut-over config and write flag.
 */
export function migrateCredentialState(config = {}) {
  let hasLegacyAuth = Boolean(config.auth);
  let hasLegacyProjectLink = Boolean(config.projectLink);

  if (!hasLegacyAuth && !hasLegacyProjectLink) {
    return { config, changed: false };
  }

  let nextConfig = { ...config };
  let credentials = { ...config.credentials };

  if (hasLegacyAuth) {
    let productionState = {
      ...getCredentialState({ credentials }, PRODUCTION_API_URL),
      auth: config.auth,
    };
    credentials[PRODUCTION_API_URL] = productionState;
    delete nextConfig.auth;
  }

  if (hasLegacyProjectLink) {
    let links = config.projectLink?.links || {};
    let activeAccount = config.projectLink?.active || null;

    for (let [account, link] of Object.entries(links)) {
      let apiUrl = normalizeApiUrl(link.apiUrl || PRODUCTION_API_URL);
      let origin = getApiOrigin(apiUrl);
      let originState = credentials[origin] || {};
      let projectLink = originState.projectLink || {
        active: null,
        links: {},
      };
      credentials[origin] = {
        ...originState,
        projectLink: {
          active:
            account === activeAccount || !projectLink.active
              ? account
              : projectLink.active,
          links: {
            ...projectLink.links,
            [account]: {
              ...link,
              apiUrl,
            },
          },
        },
      };
    }

    delete nextConfig.projectLink;
  }

  nextConfig.credentials = credentials;
  return { config: nextConfig, changed: true };
}
