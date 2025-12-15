/**
 * Server Manager Operations - Server operations with dependency injection
 *
 * Each operation takes its dependencies as parameters:
 * - fs: filesystem operations (mkdirSync, writeFileSync, existsSync, unlinkSync)
 * - createHttpServer: factory for HTTP server
 * - createTddHandler: factory for TDD handler
 * - createApiHandler: factory for API handler
 * - createApiClient: factory for API client
 *
 * This makes them trivially testable without mocking modules.
 */

import {
  buildServerInfo,
  buildServerJsonPaths,
  buildServicesWithExtras,
  determineHandlerMode,
  getPort,
} from './core.js';

// ============================================================================
// Server Lifecycle Operations
// ============================================================================

/**
 * Start the screenshot server
 * @param {Object} options - Options
 * @param {Object} options.config - Configuration object
 * @param {string|null} [options.buildId] - Build ID
 * @param {boolean} [options.tddMode] - Whether in TDD mode
 * @param {boolean} [options.setBaseline] - Whether to set baseline
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} [options.services] - Services object
 * @param {Object} options.deps - Dependencies
 * @param {Function} options.deps.createHttpServer - HTTP server factory
 * @param {Function} options.deps.createTddHandler - TDD handler factory
 * @param {Function} options.deps.createApiHandler - API handler factory
 * @param {Function} options.deps.createApiClient - API client factory
 * @param {Object} options.deps.fs - Filesystem operations
 * @returns {Promise<{ httpServer: Object, handler: Object, tddMode: boolean }>}
 */
export async function startServer({
  config,
  buildId = null,
  tddMode = false,
  setBaseline = false,
  projectRoot,
  services = {},
  deps,
}) {
  let {
    createHttpServer,
    createTddHandler,
    createApiHandler,
    createApiClient,
    fs,
  } = deps;
  let port = getPort(config);
  let handler;

  // Determine which handler mode to use
  let handlerMode = determineHandlerMode({ tddMode, config, setBaseline });

  if (handlerMode.mode === 'tdd') {
    handler = createTddHandler(
      config,
      projectRoot,
      handlerMode.tddConfig.baselineBuildId,
      handlerMode.tddConfig.baselineComparisonId,
      setBaseline
    );
    await handler.initialize();
  } else {
    let client = handlerMode.clientOptions
      ? createApiClient(handlerMode.clientOptions)
      : null;
    handler = createApiHandler(client);
  }

  // Build services with extras
  let servicesWithExtras = buildServicesWithExtras({
    services,
    buildId,
    tddService: tddMode ? handler.tddService : null,
    workingDir: projectRoot,
  });

  // Create and start HTTP server
  let httpServer = createHttpServer(port, handler, servicesWithExtras);

  if (httpServer) {
    await httpServer.start();
  }

  // Write server.json for SDK discovery
  writeServerJson({
    projectRoot,
    port,
    buildId,
    fs,
  });

  return { httpServer, handler, tddMode };
}

/**
 * Stop the screenshot server
 * @param {Object} options - Options
 * @param {Object|null} options.httpServer - HTTP server instance
 * @param {Object|null} options.handler - Handler instance
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} options.deps - Dependencies
 * @param {Object} options.deps.fs - Filesystem operations
 * @returns {Promise<void>}
 */
export async function stopServer({ httpServer, handler, projectRoot, deps }) {
  let { fs } = deps;

  if (httpServer) {
    await httpServer.stop();
  }

  if (handler?.cleanup) {
    try {
      handler.cleanup();
    } catch {
      // Don't throw - cleanup errors shouldn't fail the stop process
    }
  }

  // Clean up server.json
  removeServerJson({ projectRoot, fs });
}

// ============================================================================
// Server.json Operations
// ============================================================================

/**
 * Write server.json file for SDK discovery
 * @param {Object} options - Options
 * @param {string} options.projectRoot - Project root directory
 * @param {number} options.port - Server port
 * @param {string|null} [options.buildId] - Optional build ID
 * @param {Object} options.fs - Filesystem operations
 */
export function writeServerJson({ projectRoot, port, buildId = null, fs }) {
  try {
    let paths = buildServerJsonPaths(projectRoot);
    fs.mkdirSync(paths.dir, { recursive: true });

    let serverInfo = buildServerInfo({
      port,
      pid: process.pid,
      startTime: Date.now(),
      buildId,
    });

    fs.writeFileSync(paths.file, JSON.stringify(serverInfo, null, 2));
  } catch {
    // Non-fatal - SDK can still use health check or environment variables
  }
}

/**
 * Remove server.json file
 * @param {Object} options - Options
 * @param {string} options.projectRoot - Project root directory
 * @param {Object} options.fs - Filesystem operations
 */
export function removeServerJson({ projectRoot, fs }) {
  try {
    let paths = buildServerJsonPaths(projectRoot);
    if (fs.existsSync(paths.file)) {
      fs.unlinkSync(paths.file);
    }
  } catch {
    // Non-fatal - cleanup errors shouldn't fail the stop process
  }
}

// ============================================================================
// TDD Results
// ============================================================================

/**
 * Get TDD results from handler
 * @param {Object} options - Options
 * @param {boolean} options.tddMode - Whether in TDD mode
 * @param {Object|null} options.handler - Handler instance
 * @returns {Promise<Object|null>} TDD results or null
 */
export async function getTddResults({ tddMode, handler }) {
  if (!tddMode || !handler?.getResults) {
    return null;
  }

  return await handler.getResults();
}
