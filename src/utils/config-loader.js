import { cosmiconfigSync } from 'cosmiconfig';
import { resolve } from 'path';
import { getApiToken, getApiUrl, getParallelId } from './environment-config.js';
import { validateVizzlyConfigWithDefaults } from './config-schema.js';
import { getProjectMapping } from './global-config.js';
import * as output from './output.js';

let DEFAULT_CONFIG = {
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
  let explorer = cosmiconfigSync('vizzly');
  let result = configPath ? explorer.load(configPath) : explorer.search();

  let fileConfig = {};
  if (result && result.config) {
    // Handle ESM default export (cosmiconfig wraps it in { default: {...} })
    fileConfig = result.config.default || result.config;
  }

  // 2. Validate config file using Zod schema
  let validatedFileConfig = validateVizzlyConfigWithDefaults(fileConfig);

  // Create a proper clone of the default config to avoid shared object references
  let config = {
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

  // 3. Check project mapping for current directory (if no CLI flag)
  if (!cliOverrides.token) {
    let currentDir = process.cwd();

    let projectMapping = await getProjectMapping(currentDir);
    if (projectMapping && projectMapping.token) {
      // Handle both string tokens and token objects (backward compatibility)
      let token;
      if (typeof projectMapping.token === 'string') {
        token = projectMapping.token;
      } else if (
        typeof projectMapping.token === 'object' &&
        projectMapping.token.token
      ) {
        // Handle nested token object from old API responses
        token = projectMapping.token.token;
      } else {
        token = String(projectMapping.token);
      }

      config.apiKey = token;
      config.projectSlug = projectMapping.projectSlug;
      config.organizationSlug = projectMapping.organizationSlug;

      output.debug('Using project mapping', {
        project: projectMapping.projectSlug,
        org: projectMapping.organizationSlug,
      });
    }
  }

  // 4. Override with environment variables (higher priority than fallbacks)
  let envApiKey = getApiToken();
  let envApiUrl = getApiUrl();
  let envParallelId = getParallelId();

  if (envApiKey) {
    config.apiKey = envApiKey;
    output.debug('Using API token from environment');
  }
  if (envApiUrl !== 'https://app.vizzly.dev') config.apiUrl = envApiUrl;
  if (envParallelId) config.parallelId = envParallelId;

  // 5. Apply CLI overrides (highest priority)
  if (cliOverrides.token) {
    output.debug('Using API token from --token flag');
  }

  applyCLIOverrides(config, cliOverrides);

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
  for (let key in source) {
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
  let screenshotsDir = config.upload?.screenshotsDir || './screenshots';
  let paths = Array.isArray(screenshotsDir) ? screenshotsDir : [screenshotsDir];

  return paths.map(p => resolve(process.cwd(), p));
}
