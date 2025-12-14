/**
 * Server Manager Module - Public exports
 *
 * Provides functional server management primitives:
 * - core.js: Pure functions for building server info, configs, interfaces
 * - operations.js: Server operations with dependency injection
 */

// Core pure functions
export {
  buildClientOptions,
  buildServerInfo,
  buildServerInterface,
  buildServerJsonPaths,
  buildServicesWithExtras,
  DEFAULT_PORT,
  determineHandlerMode,
  getPort,
  hasApiKey,
} from './core.js';

// Server operations (take dependencies as parameters)
export {
  getTddResults,
  removeServerJson,
  startServer,
  stopServer,
  writeServerJson,
} from './operations.js';
