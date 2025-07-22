/**
 * Base Service Class
 * Provides common functionality for all services
 */

import { EventEmitter } from 'events';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createStandardLogger } from '../utils/logger-factory.js';

/**
 * @typedef {Object} ServiceOptions
 * @property {Object} logger - Logger instance
 * @property {AbortSignal} [signal] - Abort signal for cancellation
 */

/**
 * Base class for all services
 * @extends EventEmitter
 */
export class BaseService extends EventEmitter {
  /**
   * @param {Object} config - Service configuration
   * @param {ServiceOptions} options - Service options
   */
  constructor(config, options = {}) {
    super();

    this.config = config;
    this.logger = options.logger || createStandardLogger({ level: 'info' });
    this.signal = options.signal;

    this.started = false;
    this.stopping = false;

    // Setup signal handling
    if (this.signal) {
      this.signal.addEventListener('abort', () => this.stop());
    }
  }

  /**
   * Start the service
   * @returns {Promise<void>}
   */
  async start() {
    if (this.started) {
      this.logger.warn(`${this.constructor.name} already started`);
      return;
    }

    try {
      this.emit('starting');

      await this.onStart();

      this.started = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
      throw new VizzlyError(
        `Failed to start ${this.constructor.name}`,
        'SERVICE_START_FAILED',
        { service: this.constructor.name, error: error.message }
      );
    }
  }

  /**
   * Stop the service
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.started || this.stopping) {
      return;
    }

    this.stopping = true;

    try {
      this.emit('stopping');

      await this.onStop();

      this.started = false;
      this.emit('stopped');
    } catch (error) {
      this.emit('error', error);
      throw new VizzlyError(
        `Failed to stop ${this.constructor.name}`,
        'SERVICE_STOP_FAILED',
        { service: this.constructor.name, error: error.message }
      );
    } finally {
      this.stopping = false;
    }
  }

  /**
   * Hook for service-specific start logic
   * @protected
   * @returns {Promise<void>}
   */
  async onStart() {
    // Override in subclasses
  }

  /**
   * Hook for service-specific stop logic
   * @protected
   * @returns {Promise<void>}
   */
  async onStop() {
    // Override in subclasses
  }

  /**
   * Emit a progress event
   * @param {string} phase - Progress phase
   * @param {string} message - Progress message
   * @param {Object} [data] - Additional data
   */
  emitProgress(phase, message, data = {}) {
    this.emit('progress', {
      phase,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Check if service is running
   * @returns {boolean}
   */
  isRunning() {
    return this.started && !this.stopping;
  }

  /**
   * Wait for service to be ready
   * @param {number} [timeout=30000] - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  async waitForReady(timeout = 30000) {
    if (this.started) return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new VizzlyError('Service start timeout', 'SERVICE_TIMEOUT', {
            service: this.constructor.name,
            timeout,
          })
        );
      }, timeout);

      this.once('started', () => {
        clearTimeout(timer);
        resolve();
      });

      this.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}
