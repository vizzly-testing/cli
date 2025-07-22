/**
 * Logger Factory
 * Centralized logger creation with consistent patterns
 */

import { createLogger } from './logger.js';
import { getLogLevel } from './environment-config.js';

/**
 * Create a service logger with consistent naming and options
 * @param {string} serviceName - Name of the service (e.g., 'TDD', 'SERVER', 'API')
 * @param {Object} options - Logger options
 * @returns {Logger} Configured logger instance
 */
export function createServiceLogger(serviceName, options = {}) {
  return createLogger({
    level: options.level || getLogLevel(),
    verbose: options.verbose || false,
    silent: options.silent || false,
    colors: options.colors !== false,
    logFile: options.logFile,
    prefix: serviceName,
    ...options,
  });
}

/**
 * Create a component logger for CLI commands and utilities
 * @param {string} componentName - Name of the component
 * @param {Object} options - Logger options
 * @returns {Logger} Configured logger instance
 */
export function createComponentLogger(componentName, options = {}) {
  return createLogger({
    level: options.level || 'info',
    verbose: options.verbose || false,
    silent: options.silent || false,
    colors: options.colors !== false,
    logFile: options.logFile,
    prefix: componentName,
    ...options,
  });
}

/**
 * Create a basic logger with standard defaults
 * @param {Object} options - Logger options
 * @returns {Logger} Configured logger instance
 */
export function createStandardLogger(options = {}) {
  return createLogger({
    level: options.level || 'info',
    verbose: options.verbose || false,
    silent: options.silent || false,
    colors: options.colors !== false,
    logFile: options.logFile,
    ...options,
  });
}

/**
 * Create a logger for uploader service with specific defaults
 * @param {Object} options - Logger options
 * @returns {Logger} Configured logger instance
 */
export function createUploaderLogger(options = {}) {
  return createLogger({
    level: options.logLevel || 'info',
    verbose: options.verbose || false,
    silent: options.silent || false,
    colors: options.colors !== false,
    logFile: options.logFile,
    prefix: 'UPLOADER',
    ...options,
  });
}
