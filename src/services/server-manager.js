/**
 * Server Manager Service
 * Manages the Vizzly HTTP server
 */

import { BaseService } from './base-service.js';
import { VizzlyServer } from '../server/index.js';
import { EventEmitter } from 'events';

export class ServerManager extends BaseService {
  constructor(config, logger) {
    super(config, { logger });
    this.server = null;
  }

  async start(buildId = null, buildInfo = null, mode = 'lazy') {
    if (this.started) {
      this.logger.warn(`${this.constructor.name} already started`);
      return;
    }

    // Create event emitter for server events
    const emitter = new EventEmitter();

    this.server = new VizzlyServer({
      port: this.config?.server?.port || 47392,
      config: this.config,
      buildId,
      buildInfo,
      vizzlyApi:
        buildInfo || mode === 'eager' ? await this.createApiService() : null,
      tddMode: mode === 'tdd', // TDD mode only when explicitly set
      baselineBuild: this.config?.baselineBuildId,
      baselineComparison: this.config?.baselineComparisonId,
      workingDir: process.cwd(),
      emitter, // Pass the emitter to the server
    });

    await super.start();
  }

  async onStart() {
    if (this.server) {
      await this.server.start();
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
    if (this.server) {
      await this.server.stop();
    }
  }
}
