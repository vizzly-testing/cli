/**
 * Server Manager Module - Public exports
 *
 * Provides functional server management primitives:
 * - core.js: Pure functions for building server info, configs, interfaces
 * - operations.js: Server operations with dependency injection
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createApiClient } from '../api/index.js';
import { createApiHandler } from '../server/handlers/api-handler.js';
import { createTddHandler } from '../server/handlers/tdd-handler.js';
import { createHttpServer } from '../server/http-server.js';

// Core pure functions
import { buildServerInterface } from './core.js';

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

/**
 * Create a server manager object that provides the interface commands expect.
 * This is a thin functional wrapper that encapsulates the server lifecycle.
 *
 * @param {Object} config - Configuration object
 * @param {Object} [services={}] - Optional services object
 * @returns {Object} Server manager with start/stop/getTddResults methods
 */
export function createServerManager(config, services = {}) {
  let httpServer = null;
  let handler = null;

  let deps = {
    createHttpServer,
    createTddHandler,
    createApiHandler,
    createApiClient,
    fs: { mkdirSync, writeFileSync, existsSync, unlinkSync },
  };

  // Import operations lazily to avoid circular deps
  let ops = null;
  let getOps = async () => {
    if (!ops) {
      ops = await import('./operations.js');
    }
    return ops;
  };

  return {
    async start(buildId, tddMode, setBaseline) {
      let { startServer } = await getOps();
      let result = await startServer({
        config,
        buildId,
        tddMode,
        setBaseline,
        projectRoot: process.cwd(),
        services,
        deps,
      });
      httpServer = result.httpServer;
      handler = result.handler;
    },

    async stop() {
      let { stopServer } = await getOps();
      await stopServer({
        httpServer,
        handler,
        projectRoot: process.cwd(),
        deps,
      });
    },

    async getTddResults() {
      let { getTddResults } = await getOps();
      return getTddResults({ tddMode: true, handler });
    },

    get server() {
      return buildServerInterface({ handler, httpServer });
    },
  };
}
