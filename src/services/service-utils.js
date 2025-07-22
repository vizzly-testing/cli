/**
 * Service Utilities
 *
 * Provides utilities for service composition using higher-order functions
 * and event-based architecture patterns.
 */

import { EventEmitter } from 'events';

/**
 * Create an event emitter with enhanced functionality
 * @returns {EventEmitter} Enhanced event emitter
 */
export function createEventEmitter() {
  const emitter = new EventEmitter();

  // Add helper methods
  emitter.emitProgress = (stage, message, data = {}) => {
    const progressData = {
      stage,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };
    emitter.emit('progress', progressData);
  };

  emitter.emitError = (error, context = {}) => {
    emitter.emit('error', {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
    });
  };

  return emitter;
}

/**
 * Create a cleanup manager
 * @returns {Object} Cleanup manager with add/execute methods
 */
export function createCleanupManager() {
  const cleanupFunctions = [];

  return {
    add: fn => cleanupFunctions.push(fn),
    execute: async () => {
      for (const fn of cleanupFunctions) {
        try {
          await fn();
        } catch (error) {
          console.error('Cleanup error:', error);
        }
      }
      cleanupFunctions.length = 0;
    },
  };
}

/**
 * Create signal handlers for graceful shutdown
 * @param {Function} onSignal - Function to call on signal
 * @returns {Function} Cleanup function to remove handlers
 */
export function createSignalHandlers(onSignal) {
  const handleSignal = async signal => {
    await onSignal(signal);
    process.exit(signal === 'SIGINT' ? 130 : 1);
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  return () => {
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  };
}

/**
 * Higher-order function to add error handling to any function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Error handling options
 * @returns {Function} Wrapped function with error handling
 */
export function withErrorHandling(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (options.onError) {
        options.onError(error);
      }
      if (options.rethrow !== false) {
        throw error;
      }
      return options.defaultReturn;
    }
  };
}

/**
 * Higher-order function to add logging to any function
 * @param {Function} fn - Function to wrap
 * @param {Object} logger - Logger instance
 * @param {string} operation - Operation name for logging
 * @returns {Function} Wrapped function with logging
 */
export function withLogging(fn, logger, operation) {
  return async (...args) => {
    logger.debug(`Starting ${operation}`);
    const start = Date.now();

    try {
      const result = await fn(...args);
      const duration = Date.now() - start;
      logger.debug(`Completed ${operation} in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Failed ${operation} after ${duration}ms:`, error.message);
      throw error;
    }
  };
}

/**
 * Compose multiple functions together
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 */
export function compose(...fns) {
  return value => fns.reduceRight((acc, fn) => fn(acc), value);
}

/**
 * Create a service context with shared functionality
 * @param {Object} config - Service configuration
 * @param {Object} options - Service options
 * @returns {Object} Service context
 */
export function createServiceContext(config, options = {}) {
  const emitter = createEventEmitter(options);
  const cleanup = createCleanupManager();

  let isRunning = false;

  const context = {
    config,
    emitter,
    cleanup,

    get isRunning() {
      return isRunning;
    },
    set isRunning(value) {
      isRunning = value;
    },

    // Convenience methods
    emitProgress: emitter.emitProgress,
    emitError: emitter.emitError,
    emit: emitter.emit.bind(emitter),
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),

    // Signal handling
    setupSignalHandlers: () => {
      const removeHandlers = createSignalHandlers(async signal => {
        if (isRunning) {
          emitter.emitProgress('cleanup', `Received ${signal}, cleaning up...`);
          await cleanup.execute();
        }
      });
      cleanup.add(removeHandlers);
    },
  };

  return context;
}
