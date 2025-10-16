import { cosmiconfigSync } from 'cosmiconfig';
import { resolve } from 'path';
import { getApiToken, getApiUrl, getParallelId } from './environment-config.js';
import { validateVizzlyConfigWithDefaults } from './config-schema.js';
import { getAccessToken, getProjectMapping } from './global-config.js';

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

  // Comparison Configuration
  comparison: {
    threshold: 0.1,
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
  if (result && result.config) {
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

  // 3. Check project mapping for current directory (if no CLI flag)
  if (!cliOverrides.token) {
    const currentDir = process.cwd();
    if (process.env.DEBUG_CONFIG) {
      console.log('[CONFIG] Looking up project mapping for:', currentDir);
    }
    const projectMapping = await getProjectMapping(currentDir);
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

      // Debug logging
      if (process.env.DEBUG_CONFIG) {
        console.log('[CONFIG] Found project mapping:', {
          dir: currentDir,
          projectSlug: projectMapping.projectSlug,
          hasToken: !!projectMapping.token,
          tokenType: typeof projectMapping.token,
          tokenPrefix: token ? token.substring(0, 8) + '***' : 'none',
        });
        console.log(
          '[CONFIG] Set config.apiKey to:',
          config.apiKey ? config.apiKey.substring(0, 8) + '***' : 'NONE'
        );
      }
    } else if (process.env.DEBUG_CONFIG) {
      console.log('[CONFIG] No project mapping found for:', currentDir);
    }
  }

  // 3.5. Check global config for user access token (if no CLI flag)
  if (!config.apiKey && !cliOverrides.token) {
    const globalToken = await getAccessToken();
    if (globalToken) {
      config.apiKey = globalToken;
    }
  }

  // 4. Override with environment variables (higher priority than fallbacks)
  const envApiKey = getApiToken();
  const envApiUrl = getApiUrl();
  const envParallelId = getParallelId();
  if (process.env.DEBUG_CONFIG) {
    console.log(
      '[CONFIG] Step 4 - env vars:',
      JSON.stringify({
        hasEnvApiKey: !!envApiKey,
        envApiKeyPrefix: envApiKey ? envApiKey.substring(0, 8) + '***' : 'none',
        configApiKeyBefore: config.apiKey
          ? config.apiKey.substring(0, 8) + '***'
          : 'NONE',
      })
    );
  }
  if (envApiKey) config.apiKey = envApiKey;
  if (envApiUrl !== 'https://app.vizzly.dev') config.apiUrl = envApiUrl;
  if (envParallelId) config.parallelId = envParallelId;

  // 5. Apply CLI overrides (highest priority)
  if (process.env.DEBUG_CONFIG) {
    console.log('[CONFIG] Step 5 - before CLI overrides:', {
      configApiKey: config.apiKey
        ? config.apiKey.substring(0, 8) + '***'
        : 'NONE',
      cliToken: cliOverrides.token
        ? cliOverrides.token.substring(0, 8) + '***'
        : 'none',
    });
  }
  applyCLIOverrides(config, cliOverrides);
  if (process.env.DEBUG_CONFIG) {
    console.log('[CONFIG] Step 6 - after CLI overrides:', {
      configApiKey: config.apiKey
        ? config.apiKey.substring(0, 8) + '***'
        : 'NONE',
    });
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
