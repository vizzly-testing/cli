/**
 * Environment Configuration Utility
 * Centralized access to environment variables with proper defaults
 */

/**
 * Get the Vizzly home directory from environment
 * Used to override the default ~/.vizzly directory for storing auth, project mappings, etc.
 * Useful for development (separate dev/prod configs) or testing (isolated test configs)
 * @returns {string|undefined} Custom home directory path
 */
export function getVizzlyHome() {
  return process.env.VIZZLY_HOME;
}

/**
 * Get API token from environment
 * @returns {string|undefined} API token
 */
export function getApiToken() {
  return process.env.VIZZLY_TOKEN;
}

/**
 * Get API URL from environment
 * @returns {string} API URL with default
 */
export function getApiUrl() {
  return process.env.VIZZLY_API_URL || 'https://app.vizzly.dev';
}

/**
 * Get log level from environment
 * @returns {string} Log level with default
 */
export function getLogLevel() {
  return process.env.VIZZLY_LOG_LEVEL || 'info';
}

/**
 * Get user agent from environment
 * @returns {string|undefined} User agent string
 */
export function getUserAgent() {
  return process.env.VIZZLY_USER_AGENT;
}

/**
 * Check if Vizzly is enabled in client
 * @returns {boolean} Whether Vizzly is enabled
 */
export function isVizzlyEnabled() {
  return process.env.VIZZLY_ENABLED === 'true';
}

/**
 * Get server URL from environment
 * @returns {string|undefined} Server URL
 */
export function getServerUrl() {
  return process.env.VIZZLY_SERVER_URL;
}

/**
 * Get build ID from environment
 * @returns {string|undefined} Build ID
 */
export function getBuildId() {
  return process.env.VIZZLY_BUILD_ID;
}

/**
 * Get parallel ID from environment
 * @returns {string|undefined} Parallel ID
 */
export function getParallelId() {
  return process.env.VIZZLY_PARALLEL_ID;
}

/**
 * Check if TDD mode is enabled
 * @returns {boolean} Whether TDD mode is enabled
 */
export function isTddMode() {
  return process.env.VIZZLY_TDD === 'true';
}

/**
 * Set Vizzly enabled state (for client)
 * @param {boolean} enabled - Whether to enable Vizzly
 */
export function setVizzlyEnabled(enabled) {
  process.env.VIZZLY_ENABLED = enabled ? 'true' : 'false';
}

/**
 * Get all Vizzly environment variables
 * @returns {Object} All environment configuration
 */
export function getAllEnvironmentConfig() {
  return {
    home: getVizzlyHome(),
    apiToken: getApiToken(),
    apiUrl: getApiUrl(),
    logLevel: getLogLevel(),
    userAgent: getUserAgent(),
    enabled: isVizzlyEnabled(),
    serverUrl: getServerUrl(),
    buildId: getBuildId(),
    parallelId: getParallelId(),
    tddMode: isTddMode(),
  };
}
