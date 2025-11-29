/**
 * Unified CLI output module
 *
 * Handles all console output with proper stream separation:
 * - stdout: program output only (things you can pipe)
 * - stderr: everything else (spinners, progress, errors, debug)
 *
 * Replaces both ConsoleUI and Logger with a single, simple API.
 */

import { createColors } from './colors.js';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Module state
let config = {
  json: false,
  verbose: false,
  color: true,
  silent: false,
  logFile: null,
};

let colors = createColors({ useColor: config.color });
let spinnerInterval = null;
let spinnerMessage = '';
let lastSpinnerLine = '';

/**
 * Configure output settings
 * Call this once at CLI startup with global options
 */
export function configure(options = {}) {
  if (options.json !== undefined) config.json = options.json;
  if (options.verbose !== undefined) config.verbose = options.verbose;
  if (options.color !== undefined) config.color = options.color;
  if (options.silent !== undefined) config.silent = options.silent;
  if (options.logFile !== undefined) config.logFile = options.logFile;

  colors = createColors({ useColor: config.color });

  // Initialize log file if specified
  if (config.logFile) {
    initLogFile();
  }
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
    console.log(colors.green('✓'), message);
  }
}

/**
 * Show an info message
 */
export function info(message, data = {}) {
  if (config.silent) return;

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
  if (config.silent) return;

  if (config.json) {
    console.error(JSON.stringify({ status: 'warning', message, ...data }));
  } else {
    console.error(colors.yellow('⚠'), message);
  }
}

/**
 * Show an error message (goes to stderr)
 * Does NOT exit - caller decides whether to exit
 */
export function error(message, err = null, data = {}) {
  stopSpinner();

  if (config.json) {
    let errorData = { status: 'error', message, ...data };
    if (err instanceof Error) {
      errorData.error = {
        name: err.name,
        message: err.getUserMessage ? err.getUserMessage() : err.message,
        code: err.code,
      };
      if (config.verbose) {
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
      if (config.verbose && err.stack) {
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

  let frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  spinnerInterval = setInterval(() => {
    let frame = frames[i++ % frames.length];
    let line = `${colors.cyan(frame)} ${spinnerMessage}`;

    // Clear previous line and write new one
    process.stderr.write('\r' + ' '.repeat(lastSpinnerLine.length) + '\r');
    process.stderr.write(line);
    lastSpinnerLine = line;
  }, 80);
}

/**
 * Update spinner message
 */
export function updateSpinner(message, current = 0, total = 0) {
  if (config.json || config.silent || !process.stderr.isTTY) return;

  let progressText = total > 0 ? ` (${current}/${total})` : '';
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
      process.stderr.write('\r' + ' '.repeat(lastSpinnerLine.length) + '\r');
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
 * Log debug message (only shown in verbose mode)
 */
export function debug(message, data = {}) {
  if (!config.verbose) return;

  if (config.json) {
    console.error(JSON.stringify({ status: 'debug', message, ...data }));
  } else {
    let prefix = colors.dim(colors.magenta('⋯'));
    console.error(prefix, colors.dim(message));
    if (Object.keys(data).length > 0) {
      console.error(colors.dim('  ' + JSON.stringify(data)));
    }
  }

  writeLog('debug', message, data);
}

// ============================================================================
// Log file support
// ============================================================================

function initLogFile() {
  if (!config.logFile) return;

  try {
    mkdirSync(dirname(config.logFile), { recursive: true });
    let header = {
      timestamp: new Date().toISOString(),
      session_start: true,
      pid: process.pid,
      node_version: process.version,
      platform: process.platform,
    };
    writeFileSync(config.logFile, JSON.stringify(header) + '\n');
  } catch {
    // Silently fail - don't crash CLI for logging issues
  }
}

function writeLog(level, message, data = {}) {
  if (!config.logFile) return;

  try {
    let entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };
    appendFileSync(config.logFile, JSON.stringify(entry) + '\n');
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
