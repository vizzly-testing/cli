import { resolve } from 'node:path';
import { CONFIG_DEFAULTS, deepMerge } from '../config/core.js';
import { createConfigExplorer } from './config-discovery.js';
import { validateVizzlyConfigWithDefaults } from './config-schema.js';
import {
  getApiToken,
  getApiUrl,
  getBuildName,
  getMinClusterSize,
  getParallelId,
  getThreshold,
} from './environment-config.js';
import { getAccessToken } from './global-config.js';
import * as output from './output.js';
import { getProjectLink } from './project-link-store.js';

export async function loadConfig(configPath = null, cliOverrides = {}) {
  // 1. Load from config file using cosmiconfig
  let explorer = createConfigExplorer();
  let result = configPath ? explorer.load(configPath) : explorer.search();

  let fileConfig = {};
  if (result?.config) {
    // Handle ESM default export (cosmiconfig wraps it in { default: {...} })
    fileConfig = result.config.default || result.config;
  }

  // 2. Validate config file using Zod schema
  let validatedFileConfig = validateVizzlyConfigWithDefaults(fileConfig);
  let comparisonOverrides = {};
  for (let key of ['threshold', 'minClusterSize']) {
    if (fileConfig.comparison?.[key] !== undefined) {
      comparisonOverrides[key] = validatedFileConfig.comparison[key];
    }
  }

  // Create a proper clone of the default config to avoid shared object references
  let config = deepMerge(CONFIG_DEFAULTS, {});

  // Merge validated file config
  mergeConfig(config, validatedFileConfig);

  // 3. Override with environment variables (higher priority than fallbacks)
  let envApiKey = getApiToken();
  let envApiUrl = getApiUrl();
  let envBuildName = getBuildName();
  let envParallelId = getParallelId();
  let envThreshold = getThreshold();
  let envMinClusterSize = getMinClusterSize();

  if (envApiKey) {
    config.apiKey = envApiKey;
    output.debug('config', 'using token from environment');
  }
  if (envApiUrl !== 'https://app.vizzly.dev') config.apiUrl = envApiUrl;
  if (envBuildName) {
    config.build.name = envBuildName;
    output.debug('config', 'using build name from environment');
  }
  if (envParallelId) config.parallelId = envParallelId;
  if (envThreshold !== undefined) {
    config.comparison.threshold = envThreshold;
    comparisonOverrides.threshold = envThreshold;
  }
  if (envMinClusterSize !== undefined) {
    config.comparison.minClusterSize = envMinClusterSize;
    comparisonOverrides.minClusterSize = envMinClusterSize;
  }

  // 4. Apply CLI overrides (highest priority)
  if (cliOverrides.token) {
    output.debug('config', 'using token from --token flag');
  }

  applyCLIOverrides(config, cliOverrides);
  for (let key of ['threshold', 'minClusterSize']) {
    if (cliOverrides[key] !== undefined) {
      comparisonOverrides[key] = config.comparison[key];
    }
  }
  let validatedComparison = validateVizzlyConfigWithDefaults({
    comparison: comparisonOverrides,
  }).comparison;
  config._comparisonOverrides = Object.fromEntries(
    Object.keys(comparisonOverrides).map(key => [key, validatedComparison[key]])
  );

  // 5. Use only the credential belonging to this repository's destination.
  if (!config.apiKey && config.project) {
    let linkedProject = await getProjectLink({
      apiUrl: config.apiUrl,
      ...config.project,
    });
    if (linkedProject?.token) {
      config.apiKey = linkedProject.token;
      config.linkedProject = {
        account: linkedProject.account,
        apiUrl: linkedProject.apiUrl,
        organizationSlug: linkedProject.organizationSlug,
        organizationName: linkedProject.organizationName,
        projectSlug: linkedProject.projectSlug,
        projectName: linkedProject.projectName,
        tokenId: linkedProject.tokenId,
        tokenPrefix: linkedProject.tokenPrefix,
        expiresAt: linkedProject.expiresAt,
        storage: linkedProject.storage,
      };
      output.debug('config', 'using linked project token');
    }
  }

  // 6. Keep user auth separate from upload credentials.
  let userToken = await getAccessToken();
  if (userToken) {
    config.userToken = userToken;
    output.debug('config', 'using user login for user-authenticated commands');
  }

  config._configPath = result?.filepath || null;
  config._configApiUrl = validatedFileConfig.apiUrl;

  return config;
}

/**
 * Apply CLI option overrides to config
 * @param {Object} config - The config object to modify
 * @param {Object} cliOverrides - CLI options to apply
 */
function applyCLIOverrides(config, cliOverrides = {}) {
  // Global overrides
  if (cliOverrides.token) config.apiKey = cliOverrides.token;

  // Build-related overrides
  if (cliOverrides.buildName) config.build.name = cliOverrides.buildName;
  if (cliOverrides.environment)
    config.build.environment = cliOverrides.environment;
  if (cliOverrides.branch) config.build.branch = cliOverrides.branch;
  if (cliOverrides.commit) config.build.commit = cliOverrides.commit;
  if (cliOverrides.message) config.build.message = cliOverrides.message;
  if (cliOverrides.parallelId) config.parallelId = cliOverrides.parallelId;

  // Server overrides
  if (cliOverrides.port) config.server.port = Number(cliOverrides.port);
  if (cliOverrides.timeout)
    config.server.timeout = Number(cliOverrides.timeout);

  // Upload overrides
  if (cliOverrides.batchSize !== undefined) {
    config.upload.batchSize = Number(cliOverrides.batchSize);
  }
  if (cliOverrides.uploadTimeout !== undefined) {
    config.upload.timeout = Number(cliOverrides.uploadTimeout);
  }

  // Comparison overrides
  if (cliOverrides.threshold !== undefined)
    config.comparison.threshold = Number(cliOverrides.threshold);
  if (cliOverrides.minClusterSize !== undefined) {
    config.comparison.minClusterSize = Number(cliOverrides.minClusterSize);
  }

  // Baseline overrides
  if (cliOverrides.baselineBuild)
    config.baselineBuildId = cliOverrides.baselineBuild;
  if (cliOverrides.baselineComparison)
    config.baselineComparisonId = cliOverrides.baselineComparison;

  // Behavior flags
  if (cliOverrides.eager !== undefined) config.eager = cliOverrides.eager;
  if (cliOverrides.wait !== undefined) config.wait = cliOverrides.wait;
  if (cliOverrides.allowNoToken !== undefined)
    config.allowNoToken = cliOverrides.allowNoToken;
}

function mergeConfig(target, source) {
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      mergeConfig(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

export function getScreenshotPaths(config) {
  const screenshotsDir = config.upload?.screenshotsDir || './screenshots';
  const paths = Array.isArray(screenshotsDir)
    ? screenshotsDir
    : [screenshotsDir];

  return paths.map(p => resolve(process.cwd(), p));
}
