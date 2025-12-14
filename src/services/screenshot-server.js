/**
 * Screenshot Server Service
 * Listens for and processes screenshots from the test runner
 *
 * This class is a thin wrapper around the functional operations in
 * src/screenshot-server/. It maintains backwards compatibility while
 * delegating to pure functions for testability.
 */

import { createServer } from 'node:http';
import { VizzlyError } from '../errors/vizzly-error.js';
import {
  handleRequest,
  parseRequestBody,
  startServer,
  stopServer,
} from '../screenshot-server/index.js';
import * as output from '../utils/output.js';

export class ScreenshotServer {
  constructor(config, buildManager, options = {}) {
    this.config = config;
    this.buildManager = buildManager;
    this.server = null;

    // Dependency injection for testing
    this.deps = options.deps || {
      createHttpServer: createServer,
      output,
      createError: (message, code) => new VizzlyError(message, code),
    };
  }

  async start() {
    this.server = await startServer({
      config: this.config,
      requestHandler: this.handleRequest.bind(this),
      deps: {
        createHttpServer: this.deps.createHttpServer,
        createError: this.deps.createError,
        output: this.deps.output,
      },
    });
  }

  async stop() {
    await stopServer({
      server: this.server,
      deps: {
        output: this.deps.output,
      },
    });
  }

  async handleRequest(req, res) {
    await handleRequest({
      req,
      res,
      deps: {
        buildManager: this.buildManager,
        createError: this.deps.createError,
        output: this.deps.output,
      },
    });
  }

  async parseRequestBody(req) {
    return parseRequestBody({
      req,
      deps: {
        createError: this.deps.createError,
      },
    });
  }
}
