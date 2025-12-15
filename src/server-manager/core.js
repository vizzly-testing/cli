/**
 * Server Manager Core - Pure functions for server management logic
 *
 * No I/O, no side effects - just data transformations.
 */

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default server port
 */
export let DEFAULT_PORT = 47392;

// ============================================================================
// Config Extraction
// ============================================================================

/**
 * Extract server port from config
 * @param {Object|undefined} config - Configuration object
 * @returns {number} Server port
 */
export function getPort(config) {
  return config?.server?.port || DEFAULT_PORT;
}

/**
 * Check if API key is present in config
 * @param {Object|undefined} config - Configuration object
 * @returns {boolean} Whether API key exists
 */
export function hasApiKey(config) {
  return Boolean(config?.apiKey);
}

// ============================================================================
// Server Info Building
// ============================================================================

/**
 * Build server info object for server.json
 * @param {Object} options - Options
 * @param {number} options.port - Server port
 * @param {number} options.pid - Process ID
 * @param {number} options.startTime - Start timestamp
 * @param {string|null} [options.buildId] - Optional build ID
 * @returns {Object} Server info object
 */
export function buildServerInfo({ port, pid, startTime, buildId = null }) {
  let info = {
    port: port.toString(),
    pid,
    startTime,
  };

  if (buildId) {
    info.buildId = buildId;
  }

  return info;
}

// ============================================================================
// Services Building
// ============================================================================

/**
 * Build services object with extras for http-server
 * @param {Object} options - Options
 * @param {Object} [options.services] - Base services object
 * @param {string|null} [options.buildId] - Build ID
 * @param {Object|null} [options.tddService] - TDD service (only in TDD mode)
 * @param {string|null} [options.workingDir] - Working directory for report data
 * @returns {Object} Services object with extras
 */
export function buildServicesWithExtras({
  services = {},
  buildId = null,
  tddService = null,
  workingDir = null,
}) {
  return {
    ...services,
    buildId,
    tddService,
    workingDir,
  };
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
  if (!hasApiKey(config)) {
    return null;
  }

  return {
    baseUrl: config.apiUrl,
    token: config.apiKey,
    command: 'run',
  };
}

// ============================================================================
// Server Interface Building
// ============================================================================

/**
 * Build server interface object for compatibility
 * @param {Object} options - Options
 * @param {Object|null} options.handler - Screenshot handler
 * @param {Object|null} options.httpServer - HTTP server instance
 * @returns {Object} Server interface
 */
export function buildServerInterface({ handler, httpServer }) {
  return {
    getScreenshotCount: buildId => handler?.getScreenshotCount?.(buildId) || 0,
    finishBuild: buildId => httpServer?.finishBuild?.(buildId),
  };
}

// ============================================================================
// Handler Mode Determination
// ============================================================================

/**
 * Determine handler mode configuration
 * @param {Object} options - Options
 * @param {boolean} options.tddMode - Whether in TDD mode
 * @param {Object} options.config - Configuration object
 * @param {boolean} options.setBaseline - Whether to set baseline
 * @returns {{ mode: 'tdd'|'api', tddConfig: Object|null, clientOptions: Object|null }}
 */
export function determineHandlerMode({ tddMode, config, setBaseline }) {
  if (tddMode) {
    return {
      mode: 'tdd',
      tddConfig: {
        config,
        baselineBuildId: config?.baselineBuildId,
        baselineComparisonId: config?.baselineComparisonId,
        setBaseline,
      },
      clientOptions: null,
    };
  }

  return {
    mode: 'api',
    tddConfig: null,
    clientOptions: buildClientOptions(config),
  };
}

// ============================================================================
// Path Building
// ============================================================================

/**
 * Build server.json file path
 * @param {string} projectRoot - Project root directory
 * @returns {{ dir: string, file: string }}
 */
export function buildServerJsonPaths(projectRoot) {
  return {
    dir: `${projectRoot}/.vizzly`,
    file: `${projectRoot}/.vizzly/server.json`,
  };
}
