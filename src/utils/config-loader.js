import { resolve } from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
import { validateVizzlyConfigWithDefaults } from './config-schema.js';
import {
  getApiToken,
  getApiUrl,
  getBuildName,
  getParallelId,
} from './environment-config.js';
import { getAccessToken } from './global-config.js';
import * as output from './output.js';

const DEFAULT_CONFIG = {
  // API Configuration
  apiKey: undefined, // Will be set from env, global config, or CLI overrides
  apiUrl: getApiUrl(),

  // Server Configuration (for run command)
  server: {
    port: 47392,
    timeout: 30000,
  },

  // Build Configuration
  build: {
    name: 'Build {timestamp}',
    environment: 'test',
  },

  // Upload Configuration (for upload command)
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
    timeout: 30000,
  },

  // Comparison Configuration (CIEDE2000 Delta E: 0=exact, 1=JND, 2=recommended)
  comparison: {
    threshold: 2.0,
  },

  // TDD Configuration
  tdd: {
    openReport: false, // Whether to auto-open HTML report in browser
  },

  // Plugins
  plugins: [],
};

export async function loadConfig(configPath = null, cliOverrides = {}) {
  // 1. Load from config file using cosmiconfig
  const explorer = cosmiconfigSync('vizzly');
  const result = configPath ? explorer.load(configPath) : explorer.search();

  let fileConfig = {};
  if (result?.config) {
    // Handle ESM default export (cosmiconfig wraps it in { default: {...} })
    fileConfig = result.config.default || result.config;
  }

  // 2. Validate config file using Zod schema
  const validatedFileConfig = validateVizzlyConfigWithDefaults(fileConfig);

  // Create a proper clone of the default config to avoid shared object references
  const config = {
    ...DEFAULT_CONFIG,
    server: { ...DEFAULT_CONFIG.server },
    build: { ...DEFAULT_CONFIG.build },
    upload: { ...DEFAULT_CONFIG.upload },
    comparison: { ...DEFAULT_CONFIG.comparison },
    tdd: { ...DEFAULT_CONFIG.tdd },
    plugins: [...DEFAULT_CONFIG.plugins],
  };

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
      config.isUserAuth = true; // Flag to indicate this is user auth, not project token
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
  if (cliOverrides.port) config.server.port = parseInt(cliOverrides.port, 10);
  if (cliOverrides.timeout)
    config.server.timeout = parseInt(cliOverrides.timeout, 10);

  // Upload overrides
  if (cliOverrides.batchSize !== undefined) {
    config.upload.batchSize = parseInt(cliOverrides.batchSize, 10);
  }
  if (cliOverrides.uploadTimeout !== undefined) {
    config.upload.timeout = parseInt(cliOverrides.uploadTimeout, 10);
  }

  // Comparison overrides
  if (cliOverrides.threshold !== undefined)
    config.comparison.threshold = cliOverrides.threshold;

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
