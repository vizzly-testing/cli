/**
 * Server Manager Service
 * Manages the HTTP server with functional handlers
 */

import { BaseService } from './base-service.js';
import { createHttpServer } from '../server/http-server.js';
import { createTddHandler } from '../server/handlers/tdd-handler.js';
import { createApiHandler } from '../server/handlers/api-handler.js';
import { EventEmitter } from 'events';

export class ServerManager extends BaseService {
  constructor(config, logger) {
    super(config, { logger });
    this.httpServer = null;
    this.handler = null;
    this.emitter = null;
  }

  async start(buildId = null, tddMode = false) {
    this.buildId = buildId;
    this.tddMode = tddMode;
    return super.start();
  }

  async onStart() {
    this.emitter = new EventEmitter();
    const port = this.config?.server?.port || 47392;

    if (this.tddMode) {
      this.handler = createTddHandler(
        this.config,
        process.cwd(),
        this.config?.baselineBuildId,
        this.config?.baselineComparisonId
      );

      await this.handler.initialize();

      if (this.buildId) {
        this.handler.registerBuild(this.buildId);
      }
    } else {
      const apiService = await this.createApiService();
      this.handler = createApiHandler(apiService);
    }

    this.httpServer = createHttpServer(port, this.handler, this.emitter);

    if (this.httpServer) {
      await this.httpServer.start();
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

  async onStop() {
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
      emitter: this.emitter,
      getScreenshotCount: buildId =>
        this.handler?.getScreenshotCount?.(buildId) || 0,
      finishBuild: buildId => this.handler?.finishBuild?.(buildId),
    };
  }
}
