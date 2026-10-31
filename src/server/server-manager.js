/** Screenshot server composition and lifecycle interface. */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createApiClient } from '../domains/auth/cloud-client.js';
import { createApiHandler } from '../domains/screenshots/cloud-handler.js';
import { createTddHandler } from '../domains/tdd/screenshot-handler.js';
import { createHttpServer } from './http-server.js';
import { getTddResults, startServer, stopServer } from './server-lifecycle.js';
import { buildServerInterface } from './server-options.js';

/**
 * Create a server manager object that provides the interface commands expect.
 * This is a thin functional wrapper that encapsulates the server lifecycle.
 *
 * @param {Object} config - Configuration object
 * @param {Object} [services={}] - Optional services object
 * @param {Object} [options={}] - Runtime paths
 * @param {string} [options.projectRoot] - Workspace for capture and discovery files
 * @returns {Object} Server manager with start/stop/getTddResults methods
 */
export function createServerManager(config, services = {}, options = {}) {
  let projectRoot = options.projectRoot || process.cwd();
  let httpServer = null;
  let handler = null;

  let deps = {
    createHttpServer,
    createTddHandler,
    createApiHandler,
    createApiClient,
    fs: { mkdirSync, writeFileSync, existsSync, unlinkSync },
  };

  return {
    async start(buildId, tddMode, setBaseline) {
      let result = await startServer({
        config,
        buildId,
        tddMode,
        setBaseline,
        projectRoot,
        services,
        deps,
      });
      httpServer = result.httpServer;
      handler = result.handler;
    },

    async stop() {
      try {
        await stopServer({ httpServer, handler, projectRoot, deps });
      } finally {
        httpServer = null;
        handler = null;
      }
    },

    async getTddResults() {
      return getTddResults({ tddMode: true, handler });
    },

    get server() {
      return buildServerInterface({ handler, httpServer });
    },
  };
}
