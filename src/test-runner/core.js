/**
 * Test Runner Core - Pure functions for test execution logic
 *
 * No I/O, no side effects - just data transformations.
 */

// ============================================================================
// Environment Building
// ============================================================================

/**
 * Build environment variables for test process execution
 * @param {Object} options - Options
 * @param {number} options.port - Server port
 * @param {string} options.buildId - Build ID
 * @param {boolean} [options.setBaseline] - Whether to set baseline
 * @param {Object} [options.baseEnv] - Base environment (defaults to process.env)
 * @returns {Object} Environment variables object
 */
export function buildTestEnv({
  port,
  buildId,
  setBaseline = false,
  baseEnv = process.env,
}) {
  return {
    ...baseEnv,
    VIZZLY_SERVER_URL: `http://localhost:${port}`,
    VIZZLY_BUILD_ID: buildId,
    VIZZLY_ENABLED: 'true',
    VIZZLY_SET_BASELINE: setBaseline ? 'true' : 'false',
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

// ============================================================================
// Build Payload Building
// ============================================================================

/**
 * Build API build payload from options
 * @param {Object} options - Run options
 * @param {Object} [comparisonConfig] - Comparison configuration (threshold, minClusterSize)
 * @returns {Object} Build payload for API
 */
export function buildApiBuildPayload(options, comparisonConfig = null) {
  let payload = {
    name: options.buildName || `Test Run ${new Date().toISOString()}`,
    branch: options.branch || 'main',
    environment: options.environment || 'test',
    commit_sha: options.commit,
    commit_message: options.message,
    github_pull_request_number: options.pullRequestNumber,
    parallel_id: options.parallelId,
  };

  // Only include metadata if we have meaningful config to send
  if (
    comparisonConfig?.threshold != null ||
    comparisonConfig?.minClusterSize != null
  ) {
    payload.metadata = {
      comparison: {
        threshold: comparisonConfig.threshold,
        minClusterSize: comparisonConfig.minClusterSize,
      },
    };
  }

  return payload;
}

// ============================================================================
// Mode Determination
// ============================================================================

/**
 * Determine if we should skip Vizzly integration entirely
 * @param {Object} options - Options
 * @param {boolean} options.allowNoToken - Whether to allow running without token
 * @param {boolean} options.hasApiKey - Whether an API key is available
 * @param {boolean} options.tdd - Whether in TDD mode
 * @returns {boolean} True if Vizzly should be disabled
 */
export function shouldDisableVizzly({ allowNoToken, hasApiKey, tdd }) {
  return allowNoToken && !hasApiKey && !tdd;
}

/**
 * Determine build mode
 * @param {boolean} tdd - Whether TDD mode is enabled
 * @returns {'tdd'|'api'} Build mode
 */
export function determineBuildMode(tdd) {
  return tdd ? 'tdd' : 'api';
}

// ============================================================================
// Result Building
// ============================================================================

/**
 * Build result object for disabled run (no Vizzly integration)
 * @returns {Object} Result object
 */
export function buildDisabledRunResult() {
  return {
    testsPassed: 1,
    testsFailed: 0,
    screenshotsCaptured: 0,
  };
}

/**
 * Build final run result object
 * @param {Object} options - Options
 * @param {string|null} options.buildId - Build ID
 * @param {string|null} options.buildUrl - Build URL
 * @param {boolean} options.testSuccess - Whether tests passed
 * @param {number} options.screenshotCount - Number of screenshots
 * @param {Object|null} options.tddResults - TDD results (comparisons, etc.)
 * @returns {Object} Final result object
 */
export function buildRunResult({
  buildId,
  buildUrl,
  testSuccess,
  screenshotCount,
  tddResults,
}) {
  return {
    buildId,
    url: buildUrl,
    testsPassed: testSuccess ? 1 : 0,
    testsFailed: testSuccess ? 0 : 1,
    screenshotsCaptured: screenshotCount,
    comparisons: tddResults?.comparisons || null,
    failed: (tddResults?.failed || 0) > 0,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate test command is provided
 * @param {string|undefined} testCommand - Test command to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateTestCommand(testCommand) {
  if (!testCommand) {
    return { valid: false, error: 'No test command provided' };
  }
  return { valid: true, error: null };
}

/**
 * Validate daemon mode requirements
 * @param {Object} options - Options
 * @param {boolean} options.tdd - Whether TDD mode is enabled
 * @param {boolean} options.daemon - Whether daemon mode is enabled
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDaemonMode({ tdd, daemon }) {
  if (!tdd || !daemon) {
    return {
      valid: false,
      error: 'Initialize method is only for TDD daemon mode',
    };
  }
  return { valid: true, error: null };
}

// ============================================================================
// Client Options Building
// ============================================================================

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
 * Check if API key is available
 * @param {Object} config - Configuration object
 * @returns {boolean} Whether API key exists
 */
export function hasApiKey(config) {
  return Boolean(config?.apiKey);
}

// ============================================================================
// Spawn Options Building
// ============================================================================

/**
 * Build spawn options for test command execution
 * @param {Object} env - Environment variables
 * @returns {Object} Spawn options
 */
export function buildSpawnOptions(env) {
  return {
    env,
    stdio: 'inherit',
    shell: true,
  };
}

// ============================================================================
// Set Baseline Normalization
// ============================================================================

/**
 * Normalize setBaseline option (handles both camelCase and kebab-case)
 * @param {Object} options - Options object
 * @returns {boolean} Whether to set baseline
 */
export function normalizeSetBaseline(options) {
  return Boolean(options?.setBaseline || options?.['set-baseline']);
}
