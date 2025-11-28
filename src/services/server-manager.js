/**
 * Server Manager Service
 * Manages the HTTP server with functional handlers
 */

import { createHttpServer } from '../server/http-server.js';
import { createTddHandler } from '../server/handlers/tdd-handler.js';
import { createApiHandler } from '../server/handlers/api-handler.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export class ServerManager {
  constructor(config, options = {}) {
    this.config = config;
    this.logger = options.logger;
    this.httpServer = null;
    this.handler = null;
    this.services = options.services || {};
    this.buildId = null;
    this.tddMode = false;
    this.setBaseline = false;
  }

  async start(buildId = null, tddMode = false, setBaseline = false) {
    this.buildId = buildId;
    this.tddMode = tddMode;
    this.setBaseline = setBaseline;

    const port = this.config?.server?.port || 47392;

    if (this.tddMode) {
      this.handler = createTddHandler(
        this.config,
        process.cwd(),
        this.config?.baselineBuildId,
        this.config?.baselineComparisonId,
        this.setBaseline
      );

      await this.handler.initialize();
    } else {
      const apiService = await this.createApiService();
      this.handler = createApiHandler(apiService);
    }

    // Pass buildId and tddService in services so http-server can use them
    const servicesWithExtras = {
      ...this.services,
      buildId: this.buildId,
      // Expose tddService for baseline download operations (TDD mode only)
      tddService: this.tddMode ? this.handler.tddService : null,
    };
    this.httpServer = createHttpServer(port, this.handler, servicesWithExtras);

    if (this.httpServer) {
      await this.httpServer.start();
    }

    // Write server info to .vizzly/server.json for SDK discovery
    // This allows SDKs that can't access environment variables (like Swift/iOS)
    // to discover both the server port and current build ID
    try {
      const vizzlyDir = join(process.cwd(), '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const serverFile = join(vizzlyDir, 'server.json');
      const serverInfo = {
        port: port.toString(),
        pid: process.pid,
        startTime: Date.now(),
      };

      // Include buildId if we have one (for `vizzly run` mode)
      if (this.buildId) {
        serverInfo.buildId = this.buildId;
      }

      writeFileSync(serverFile, JSON.stringify(serverInfo, null, 2));
      this.logger.debug(`Wrote server info to ${serverFile}`);
    } catch (error) {
      // Non-fatal - SDK can still use health check or environment variables
      this.logger.debug(`Failed to write server.json: ${error.message}`);
    }
  }

  async createApiService() {
    if (!this.config.apiKey) return null;

    const { ApiService } = await import('./api-service.js');
    return new ApiService(
      { ...this.config, command: 'run' },
      { logger: this.logger }
    );
  }

  async stop() {
    if (this.httpServer) {
      await this.httpServer.stop();
    }
    if (this.handler?.cleanup) {
      try {
        this.handler.cleanup();
      } catch (error) {
        this.logger.debug('Handler cleanup error:', error.message);
        // Don't throw - cleanup errors shouldn't fail the stop process
      }
    }
  }

  // Expose server interface for compatibility
  get server() {
    return {
      getScreenshotCount: buildId =>
        this.handler?.getScreenshotCount?.(buildId) || 0,
      finishBuild: buildId => this.httpServer?.finishBuild?.(buildId),
    };
  }
}
