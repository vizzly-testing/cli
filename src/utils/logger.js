import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { getEnvironmentDetails } from '../utils/environment.js';
import { getLogLevel } from './environment-config.js';

/**
 * Structured logger with multiple output targets and log levels
 */
export class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.logFile = options.logFile;
    this.verbose = options.verbose || false;
    this.silent = options.silent || false;
    this.colors = options.colors !== false; // Default to true unless explicitly disabled

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };

    // Initialize log file if specified
    if (this.logFile) {
      this.initLogFile();
    }
  }

  /**
   * Initialize log file with session header
   */
  initLogFile() {
    try {
      mkdirSync(dirname(this.logFile), { recursive: true });

      const sessionHeader = {
        timestamp: new Date().toISOString(),
        session_start: true,
        environment: getEnvironmentDetails(),
        pid: process.pid,
        node_version: process.version,
        platform: process.platform,
      };

      writeFileSync(this.logFile, JSON.stringify(sessionHeader) + '\n');
    } catch (error) {
      console.error('Failed to initialize log file:', error.message);
    }
  }

  /**
   * Check if message should be logged at current level
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  /**
   * Log a message with specified level
   */
  log(level, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };

    // Write to log file if configured
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
      } catch {
        // Silently fail to avoid infinite loops
      }
    }

    // Output to console unless silent
    if (!this.silent) {
      this.outputToConsole(level, message, data);
    }
  }

  /**
   * Output formatted message to console
   */
  outputToConsole(level, message, data) {
    const prefix = this.getColoredPrefix(level);
    const formattedMessage = `${prefix} ${message}`;

    // Use appropriate console method
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        if (this.verbose && data.stack) {
          console.error(data.stack);
        }
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'debug':
        if (this.verbose) {
          console.log(formattedMessage);
          if (Object.keys(data).length > 0) {
            console.log('  Data:', JSON.stringify(data, null, 2));
          }
        }
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Get colored prefix for log level
   */
  getColoredPrefix(level) {
    if (!this.colors) {
      return `[${level.toUpperCase()}]`;
    }

    const colors = {
      error: '\x1b[31m✖\x1b[0m', // Red X
      warn: '\x1b[33m⚠\x1b[0m', // Yellow warning
      info: '\x1b[36mℹ\x1b[0m', // Cyan info
      debug: '\x1b[35m🔍\x1b[0m', // Magenta debug
    };

    return colors[level] || `[${level.toUpperCase()}]`;
  }

  /**
   * Convenience methods
   */
  error(message, data = {}) {
    this.log('error', message, data);
  }

  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }

  debug(message, data = {}) {
    this.log('debug', message, data);
  }

  /**
   * Log progress updates
   */
  progress(stage, message, data = {}) {
    this.info(`[${stage}] ${message}`, data);
  }

  /**
   * Log command execution
   */
  command(command, data = {}) {
    this.debug(`Executing command: ${command}`, data);
  }

  /**
   * Log performance metrics
   */
  perf(operation, duration, data = {}) {
    this.debug(`${operation} completed in ${duration}ms`, data);
  }

  /**
   * Create child logger with additional context
   */
  child(context = {}) {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger that inherits from parent with additional context
 */
class ChildLogger {
  constructor(parent, context) {
    this.parent = parent;
    this.context = context;
  }

  log(level, message, data = {}) {
    this.parent.log(level, message, { ...this.context, ...data });
  }

  error(message, data = {}) {
    this.log('error', message, data);
  }

  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  info(message, data = {}) {
    this.log('info', message, data);
  }

  debug(message, data = {}) {
    this.log('debug', message, data);
  }

  progress(stage, message, data = {}) {
    this.info(`[${stage}] ${message}`, data);
  }
}

/**
 * Create default logger instance
 */
export function createLogger(options = {}) {
  // Auto-detect color support
  const supportsColor =
    process.stdout.isTTY &&
    process.env.TERM !== 'dumb' &&
    !process.env.NO_COLOR &&
    !options.noColor;

  // Determine log level from environment
  const level = options.level || getLogLevel();

  // Create log file path if verbose mode
  const logFile = options.verbose
    ? join(process.cwd(), '.vizzly', 'debug.log')
    : options.logFile;

  return new Logger({
    level,
    logFile,
    verbose: options.verbose,
    silent: options.silent,
    colors: supportsColor && options.colors !== false,
  });
}
