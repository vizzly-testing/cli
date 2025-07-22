/**
 * Server Manager Service
 * Manages the Vizzly HTTP server
 */

import { BaseService } from './base-service.js';
import { VizzlyServer } from '../server/index.js';

export class ServerManager extends BaseService {
  constructor(config, logger) {
    super(config, logger);
    this.server = null;
  }

  async onStart() {
    this.server = new VizzlyServer(this.config);
    await this.server.start();
  }

  async onStop() {
    if (this.server) {
      await this.server.stop();
    }
  }
}
