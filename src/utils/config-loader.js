import { resolve } from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
import { CONFIG_DEFAULTS, deepMerge } from '../config/core.js';
import { validateVizzlyConfigWithDefaults } from './config-schema.js';
import {
  getApiToken,
  getApiUrl,
  getBuildName,
  getParallelId,
} from './environment-config.js';
import { getAccessToken } from './global-config.js';
import * as output from './output.js';

export async function loadConfig(configPath = null, cliOverrides = {}) {
  // 1. Load from config file using cosmiconfig
  let explorer = cosmiconfigSync('vizzly');
  let result = configPath ? explorer.load(configPath) : explorer.search();

  let fileConfig = {};
  if (result?.config) {
    // Handle ESM default export (cosmiconfig wraps it in { default: {...} })
    fileConfig = result.config.default || result.config;
  }

  // 2. Validate config file using Zod schema
  let validatedFileConfig = validateVizzlyConfigWithDefaults(fileConfig);

  // Create a proper clone of the default config to avoid shared object references
  let config = deepMerge(CONFIG_DEFAULTS, {});

  // Merge validated file config
  mergeConfig(config, validatedFileConfig);

  // 3. Override with environment variables (higher priority than fallbacks)
  const envApiKey = getApiToken();
  const envApiUrl = getApiUrl();
  const envBuildName = getBuildName();
  const envParallelId = getParallelId();

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

  // 4. Apply CLI overrides (highest priority)
  if (cliOverrides.token) {
    output.debug('config', 'using token from --token flag');
  }

  applyCLIOverrides(config, cliOverrides);

  // 5. Fall back to user auth token if no other token found
  // This enables interactive commands (builds, comparisons, approve, etc.)
  // to work without a project token when the user is logged in
  if (!config.apiKey) {
    let userToken = await getAccessToken();
    if (userToken) {
      config.apiKey = userToken;
      output.debug('config', 'using token from user login');
    }
  }

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
    config.comparison.threshold = cliOverrides.threshold;
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
