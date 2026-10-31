/**
 * Build environment variables for test process execution
 * @param {Object} options - Options
 * @param {number} options.port - Server port
 * @param {string} options.buildId - Build ID
 * @param {boolean} [options.setBaseline] - Whether to set baseline
 * @param {boolean} [options.failOnDiff] - Whether visual diffs should fail tests
 * @param {Object} [options.baseEnv] - Base environment (defaults to process.env)
 * @returns {Object} Environment variables object
 */
export function buildTestEnv({
  port,
  buildId,
  setBaseline = false,
  failOnDiff = false,
  baseEnv = process.env,
}) {
  return {
    ...baseEnv,
    VIZZLY_SERVER_URL: `http://localhost:${port}`,
    VIZZLY_BUILD_ID: buildId,
    VIZZLY_ENABLED: 'true',
    VIZZLY_SET_BASELINE: setBaseline ? 'true' : 'false',
    VIZZLY_FAIL_ON_DIFF: failOnDiff ? 'true' : 'false',
  };
}

/**
 * Build environment for disabled Vizzly (allowNoToken mode)
 * @param {Object} [baseEnv] - Base environment (defaults to process.env)
 * @returns {Object} Environment variables object
 */
export function buildDisabledEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    VIZZLY_ENABLED: 'false',
  };
}

/**
 * Build API client options from config
 * @param {Object} config - Configuration object
 * @returns {Object|null} Client options or null if no API key
 */
export function buildClientOptions(config) {
  if (!config?.apiKey) {
    return null;
  }

  return {
    baseUrl: config.apiUrl,
    token: config.apiKey,
    command: 'run',
  };
}

/**
 * Build spawn options for test command execution
 * @param {Object} env - Environment variables
 * @param {Object} [options] - Spawn display options
 * @param {boolean} [options.json] - Keep stdout reserved for CLI JSON output
 * @returns {Object} Spawn options
 */
export function buildSpawnOptions(env, options = {}) {
  return {
    env,
    stdio: options.json ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    shell: true,
  };
}
