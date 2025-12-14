/**
 * Server Manager Service
 * Manages the HTTP server with functional handlers
 *
 * This class is a thin wrapper around the functional operations in
 * src/server-manager/. It maintains backwards compatibility while
 * delegating to pure functions for testability.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createApiClient } from '../api/index.js';
import { createApiHandler } from '../server/handlers/api-handler.js';
import { createTddHandler } from '../server/handlers/tdd-handler.js';
import { createHttpServer } from '../server/http-server.js';
import {
  buildServerInterface,
  getTddResults,
  startServer,
  stopServer,
} from '../server-manager/index.js';

export class ServerManager {
  constructor(config, options = {}) {
    this.config = config;
    this.httpServer = null;
    this.handler = null;
    this.services = options.services || {};
    this.tddMode = false;

    // Dependency injection for testing - defaults to real implementations
    this.deps = options.deps || {
      createHttpServer,
      createTddHandler,
      createApiHandler,
      createApiClient,
      fs: { mkdirSync, writeFileSync, existsSync, unlinkSync },
    };
  }

  async start(buildId = null, tddMode = false, setBaseline = false) {
    this.buildId = buildId;
    this.tddMode = tddMode;
    this.setBaseline = setBaseline;

    let result = await startServer({
      config: this.config,
      buildId,
      tddMode,
      setBaseline,
      projectRoot: process.cwd(),
      services: this.services,
      deps: this.deps,
    });

    this.httpServer = result.httpServer;
    this.handler = result.handler;
  }

  async stop() {
    await stopServer({
      httpServer: this.httpServer,
      handler: this.handler,
      projectRoot: process.cwd(),
      deps: this.deps,
    });
  }

  // Expose server interface for compatibility
  get server() {
    return buildServerInterface({
      handler: this.handler,
      httpServer: this.httpServer,
    });
  }

  /**
   * Get TDD results (comparisons, screenshot count, etc.)
   * Only available in TDD mode after tests have run
   */
  async getTddResults() {
    return getTddResults({
      tddMode: this.tddMode,
      handler: this.handler,
    });
  }
}
