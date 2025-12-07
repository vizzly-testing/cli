/**
 * Unified CLI output module
 *
 * Handles all console output with proper stream separation:
 * - stdout: program output only (things you can pipe)
 * - stderr: everything else (spinners, progress, errors, debug)
 *
 * Replaces both ConsoleUI and Logger with a single, simple API.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createColors } from './colors.js';
import { getLogLevel as getEnvLogLevel } from './environment-config.js';

/**
 * Log levels in order of severity (lowest to highest)
 * debug < info < warn < error
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const VALID_LOG_LEVELS = Object.keys(LOG_LEVELS);

// Module state
const config = {
  json: false,
  logLevel: null, // null = not yet initialized, will check env var on first configure
  color: true,
  silent: false,
  logFile: null,
};

let colors = createColors({ useColor: config.color });
let spinnerInterval = null;
let spinnerMessage = '';
let lastSpinnerLine = '';
let startTime = Date.now();

// Track if we've shown the header
let headerShown = false;

/**
 * Check if a given log level should be displayed based on current config
 * @param {string} level - The level to check (debug, info, warn, error)
 * @returns {boolean} Whether the level should be displayed
 */
function shouldLog(level) {
  if (config.silent) return false;
  // If logLevel not yet initialized, default to 'info'
  let configLevel = config.logLevel || 'info';
  let currentLevel = LOG_LEVELS[configLevel];
  let targetLevel = LOG_LEVELS[level];
  // Default to showing everything if levels are invalid
  if (currentLevel === undefined) currentLevel = LOG_LEVELS.info;
  if (targetLevel === undefined) targetLevel = LOG_LEVELS.debug;
  return targetLevel >= currentLevel;
}

/**
 * Normalize and validate log level
 * @param {string} level - Log level to validate
 * @returns {string} Valid log level (defaults to 'info' if invalid)
 */
function normalizeLogLevel(level) {
  if (!level) return 'info';
  let normalized = level.toLowerCase().trim();
  return VALID_LOG_LEVELS.includes(normalized) ? normalized : 'info';
}

/**
 * Configure output settings
 * Call this once at CLI startup with global options
 *
 * @param {Object} options - Configuration options
 * @param {boolean} [options.json] - Enable JSON output mode
 * @param {string} [options.logLevel] - Log level (debug, info, warn, error)
 * @param {boolean} [options.verbose] - Shorthand for logLevel='debug' (backwards compatible)
 * @param {boolean} [options.color] - Enable colored output
 * @param {boolean} [options.silent] - Suppress all output
 * @param {string} [options.logFile] - Path to log file
 * @param {boolean} [options.resetTimer] - Reset the start timer (default: true)
 */
export function configure(options = {}) {
  if (options.json !== undefined) config.json = options.json;
  if (options.color !== undefined) config.color = options.color;
  if (options.silent !== undefined) config.silent = options.silent;
  if (options.logFile !== undefined) config.logFile = options.logFile;

  // Determine log level with priority:
  // 1. Explicit logLevel option (highest priority)
  // 2. verbose flag (maps to 'debug')
  // 3. Keep existing level if already initialized
  // 4. VIZZLY_LOG_LEVEL env var (checked on first configure when logLevel is null)
  // 5. Default ('info')
  if (options.logLevel !== undefined) {
    config.logLevel = normalizeLogLevel(options.logLevel);
  } else if (options.verbose) {
    config.logLevel = 'debug';
  } else if (config.logLevel === null) {
    // First configure call - check env var
    let envLogLevel = getEnvLogLevel();
    config.logLevel = normalizeLogLevel(envLogLevel);
  }
  // If logLevel is already set (not null) and no new option was provided, keep it

  colors = createColors({ useColor: config.color });

  // Reset state (optional - commands may want to preserve timer)
  if (options.resetTimer !== false) {
    startTime = Date.now();
    headerShown = false;
  }

  // Initialize log file if specified
  if (config.logFile) {
    initLogFile();
  }
}

/**
 * Get current log level
 * @returns {string} Current log level (defaults to 'info' if not initialized)
 */
export function getLogLevel() {
  return config.logLevel || 'info';
}

/**
 * Check if verbose/debug mode is enabled
 * @returns {boolean} True if debug level is active
 */
export function isVerbose() {
  return config.logLevel === 'debug';
}

/**
 * Show command header (e.g., "vizzly · tdd · local")
 * Only shows once per command execution
 */
export function header(command, mode = null) {
  if (config.json || config.silent || headerShown) return;
  headerShown = true;

  const parts = ['vizzly', command];
  if (mode) parts.push(mode);

  console.error('');
  console.error(colors.dim(parts.join(' · ')));
  console.error('');
}

/**
 * Get current colors instance (for custom formatting)
 */
export function getColors() {
  return colors;
}

// ============================================================================
// User-facing output (what the user asked for)
// ============================================================================

/**
 * Show a success message
 */
export function success(message, data = {}) {
  stopSpinner();
  if (config.silent) return;

  if (config.json) {
    console.log(JSON.stringify({ status: 'success', message, ...data }));
  } else {
    console.error('');
    console.error(colors.green('✓'), message);
  }
}

/**
 * Show final result summary (e.g., "✓ 5 screenshots · 234ms")
 */
export function result(message) {
  stopSpinner();
  if (config.silent) return;

  const elapsed = getElapsedTime();

  if (config.json) {
    console.log(JSON.stringify({ status: 'complete', message, elapsed }));
  } else {
    console.error('');
    console.error(
      colors.green('✓'),
      `${message} ${colors.dim(`· ${elapsed}`)}`
    );
  }
}

/**
 * Show an info message
 */
export function info(message, data = {}) {
  if (!shouldLog('info')) return;

  if (config.json) {
    console.log(JSON.stringify({ status: 'info', message, ...data }));
  } else {
    console.log(colors.cyan('ℹ'), message);
  }
}

/**
 * Show a warning message (goes to stderr)
 */
export function warn(message, data = {}) {
  stopSpinner();
  if (!shouldLog('warn')) return;

  if (config.json) {
    console.error(JSON.stringify({ status: 'warning', message, ...data }));
  } else {
    console.error(colors.yellow('⚠'), message);
  }
}

/**
 * Show an error message (goes to stderr)
 * Does NOT exit - caller decides whether to exit
 * Note: Errors are always shown regardless of log level (unless silent mode)
 */
export function error(message, err = null, data = {}) {
  stopSpinner();

  // Errors always show (unless silent), but we still check shouldLog for consistency
  if (config.silent) return;

  if (config.json) {
    let errorData = { status: 'error', message, ...data };
    if (err instanceof Error) {
      errorData.error = {
        name: err.name,
        message: err.getUserMessage ? err.getUserMessage() : err.message,
        code: err.code,
      };
      if (isVerbose()) {
        errorData.error.stack = err.stack;
      }
    }
    console.error(JSON.stringify(errorData));
  } else {
    console.error(colors.red('✖'), message);

    // Show error details
    if (err instanceof Error) {
      let errMessage = err.getUserMessage ? err.getUserMessage() : err.message;
      if (errMessage && errMessage !== message) {
        console.error(colors.dim(errMessage));
      }
      if (isVerbose() && err.stack) {
        console.error(colors.dim(err.stack));
      }
    } else if (typeof err === 'string' && err) {
      console.error(colors.dim(err));
    }
  }

  // Write to log file
  writeLog('error', message, { error: err?.message, ...data });
}

/**
 * Print a blank line for spacing
 */
export function blank() {
  if (!config.json && !config.silent) {
    console.log('');
  }
}

/**
 * Print raw text without any formatting
 */
export function print(text) {
  if (!config.silent) {
    console.log(text);
  }
}

/**
 * Print raw text to stderr
 */
export function printErr(text) {
  if (!config.silent) {
    console.error(text);
  }
}

/**
 * Output structured data
 */
export function data(obj) {
  if (config.json) {
    console.log(JSON.stringify({ status: 'data', data: obj }));
  } else {
    console.log(JSON.stringify(obj, null, 2));
  }
}

// ============================================================================
// Spinner / Progress (stderr so it doesn't pollute piped output)
// ============================================================================

/**
 * Start a spinner with message
 */
export function startSpinner(message) {
  if (config.json || config.silent || !process.stderr.isTTY) return;

  stopSpinner();
  spinnerMessage = message;

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  spinnerInterval = setInterval(() => {
    const frame = frames[i++ % frames.length];
    const line = `${colors.cyan(frame)} ${spinnerMessage}`;

    // Clear previous line and write new one
    process.stderr.write(`\r${' '.repeat(lastSpinnerLine.length)}\r`);
    process.stderr.write(line);
    lastSpinnerLine = line;
  }, 80);
}

/**
 * Update spinner message
 */
export function updateSpinner(message, current = 0, total = 0) {
  if (config.json || config.silent || !process.stderr.isTTY) return;

  const progressText = total > 0 ? ` (${current}/${total})` : '';
  spinnerMessage = `${message}${progressText}`;

  if (!spinnerInterval) {
    startSpinner(spinnerMessage);
  }
}

/**
 * Stop the spinner
 */
export function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;

    // Clear the spinner line
    if (process.stderr.isTTY) {
      process.stderr.write(`\r${' '.repeat(lastSpinnerLine.length)}\r`);
    }
    lastSpinnerLine = '';
    spinnerMessage = '';
  }
}

/**
 * Show progress update
 */
export function progress(message, current = 0, total = 0) {
  if (config.silent) return;

  if (config.json) {
    console.log(
      JSON.stringify({
        status: 'progress',
        message,
        progress: { current, total },
      })
    );
  } else {
    updateSpinner(message, current, total);
  }
}

// ============================================================================
// Debug logging (only when verbose, goes to stderr and/or file)
// ============================================================================

/**
 * Format elapsed time since CLI start
 */
function getElapsedTime() {
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) {
    return `${elapsed}ms`;
  }
  return `${(elapsed / 1000).toFixed(1)}s`;
}

/**
 * Format a data object for human-readable output
 * Only shows meaningful values, skips nulls/undefined/empty
 */
function formatData(data) {
  if (!data || typeof data !== 'object') return '';

  const entries = Object.entries(data).filter(([, v]) => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });

  if (entries.length === 0) return '';

  // For simple key-value pairs, show inline
  if (entries.length <= 4 && entries.every(([, v]) => typeof v !== 'object')) {
    return entries.map(([k, v]) => `${k}=${v}`).join(' ');
  }

  // For complex objects, show on multiple lines
  return entries
    .map(([k, v]) => {
      if (typeof v === 'object') {
        return `${k}: ${JSON.stringify(v)}`;
      }
      return `${k}: ${v}`;
    })
    .join('\n');
}

/**
 * Log debug message with component prefix (only shown when log level is 'debug')
 *
 * @param {string} component - Component name (e.g., 'server', 'config', 'build')
 * @param {string} message - Debug message
 * @param {Object} data - Optional data object to display inline
 */
export function debug(component, message, data = {}) {
  if (!shouldLog('debug')) return;

  // Handle legacy calls: debug('message') or debug('message', {data})
  if (typeof message === 'object' || message === undefined) {
    data = message || {};
    message = component;
    component = null;
  }

  let elapsed = getElapsedTime();

  if (config.json) {
    console.error(
      JSON.stringify({
        status: 'debug',
        time: elapsed,
        component,
        message,
        ...data,
      })
    );
  } else {
    let formattedData = formatData(data);
    let dataStr = formattedData ? ` ${colors.dim(formattedData)}` : '';

    if (component) {
      // Component-based format: "  server    listening on :47392"
      let paddedComponent = component.padEnd(8);
      console.error(`  ${colors.cyan(paddedComponent)} ${message}${dataStr}`);
    } else {
      // Simple format for legacy calls
      console.error(`  ${colors.dim('•')} ${colors.dim(message)}${dataStr}`);
    }
  }

  writeLog('debug', message, { component, ...data });
}

// ============================================================================
// Log file support
// ============================================================================

function initLogFile() {
  if (!config.logFile) return;

  try {
    mkdirSync(dirname(config.logFile), { recursive: true });
    const header = {
      timestamp: new Date().toISOString(),
      session_start: true,
      pid: process.pid,
      node_version: process.version,
      platform: process.platform,
    };
    writeFileSync(config.logFile, `${JSON.stringify(header)}\n`);
  } catch {
    // Silently fail - don't crash CLI for logging issues
  }
}

function writeLog(level, message, data = {}) {
  if (!config.logFile) return;

  try {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };
    appendFileSync(config.logFile, `${JSON.stringify(entry)}\n`);
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up (stop spinner, flush logs)
 */
export function cleanup() {
  stopSpinner();
}

/**
 * Reset module state to defaults (useful for testing)
 * This resets all configuration to initial state
 */
export function reset() {
  stopSpinner();
  config.json = false;
  config.logLevel = null;
  config.color = true;
  config.silent = false;
  config.logFile = null;
  colors = createColors({ useColor: config.color });
  startTime = Date.now();
  headerShown = false;
}
