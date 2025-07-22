import { cosmiconfigSync } from 'cosmiconfig';
import { resolve } from 'path';

const DEFAULT_CONFIG = {
  // API Configuration
  apiKey: process.env.VIZZLY_TOKEN,
  apiUrl: process.env.VIZZLY_API_URL || 'https://vizzly.dev',

  // Server Configuration (for run command)
  server: {
    port: 3001,
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
    threshold: 0.01,
  },
};

export async function loadConfig(configPath = null, cliOverrides = {}) {
  // Create a proper clone of the default config to avoid shared object references
  const config = {
    ...DEFAULT_CONFIG,
    server: { ...DEFAULT_CONFIG.server },
    build: { ...DEFAULT_CONFIG.build },
    upload: { ...DEFAULT_CONFIG.upload },
    comparison: { ...DEFAULT_CONFIG.comparison },
  };

  // 1. Load from config file using cosmiconfig
  const explorer = cosmiconfigSync('vizzly');
  const result = configPath ? explorer.load(configPath) : explorer.search();

  if (result && result.config) {
    mergeConfig(config, result.config);
  }

  // 2. Override with environment variables
  if (process.env.VIZZLY_TOKEN) config.apiKey = process.env.VIZZLY_TOKEN;
  if (process.env.VIZZLY_API_URL) config.apiUrl = process.env.VIZZLY_API_URL;

  // 3. Apply CLI overrides (highest priority)
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
  if (cliOverrides.project) config.projectId = cliOverrides.project;

  // Build-related overrides
  if (cliOverrides.buildName) config.build.name = cliOverrides.buildName;
  if (cliOverrides.environment)
    config.build.environment = cliOverrides.environment;
  if (cliOverrides.branch) config.build.branch = cliOverrides.branch;
  if (cliOverrides.commit) config.build.commit = cliOverrides.commit;
  if (cliOverrides.message) config.build.message = cliOverrides.message;

  // Server overrides
  if (cliOverrides.port) config.server.port = parseInt(cliOverrides.port, 10);
  if (cliOverrides.timeout)
    config.server.timeout = parseInt(cliOverrides.timeout, 10);

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
