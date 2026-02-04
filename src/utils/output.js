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
  jsonFields: null, // null = all fields, array = selected fields
  logLevel: null, // null = not yet initialized, will check env var on first configure
  color: undefined, // undefined = auto-detect, true = force on, false = force off
  silent: false,
  logFile: null,
};

let colors = createColors({ useColor: config.color }); // undefined triggers auto-detect
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
 * Parse --json flag value into field list
 * Supports: true (all fields), "field1,field2" (selected fields)
 * @param {boolean|string} jsonArg - The --json flag value
 * @returns {string[]|null} Array of field names, or null for all fields
 */
export function parseJsonFields(jsonArg) {
  if (jsonArg === true || jsonArg === 'true') return null; // All fields
  if (typeof jsonArg === 'string' && jsonArg.length > 0) {
    return jsonArg.split(',').map(f => f.trim()).filter(f => f.length > 0);
  }
  return null;
}

/**
 * Get a nested value from an object using dot notation
 * @param {Object} obj - Source object
 * @param {string} path - Dot-separated path (e.g., "comparisons.total")
 * @returns {*} The value at the path, or undefined if not found
 */
function getNestedValue(obj, path) {
  let parts = path.split('.');
  let current = obj;
  for (let part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Set a nested value in an object using dot notation
 * Creates intermediate objects as needed
 * @param {Object} obj - Target object
 * @param {string} path - Dot-separated path (e.g., "comparisons.total")
 * @param {*} value - Value to set
 */
function setNestedValue(obj, path, value) {
  let parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    let part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Select specific fields from an object
 * Supports dot notation for nested fields (e.g., "comparisons.total")
 * @param {Object|Array} obj - Source object or array
 * @param {string[]} fields - Fields to select
 * @returns {Object|Array} Object with only selected fields
 */
function selectFields(obj, fields) {
  if (Array.isArray(obj)) {
    return obj.map(item => selectFields(item, fields));
  }

  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  let result = {};
  for (let field of fields) {
    let value = getNestedValue(obj, field);
    if (value !== undefined) {
      setNestedValue(result, field, value);
    }
  }
  return result;
}

/**
 * Configure output settings
 * Call this once at CLI startup with global options
 *
 * @param {Object} options - Configuration options
 * @param {boolean|string} [options.json] - Enable JSON output mode, optionally with field selection
 * @param {string[]} [options.jsonFields] - Fields to include in JSON output (null = all)
 * @param {string} [options.logLevel] - Log level (debug, info, warn, error)
 * @param {boolean} [options.verbose] - Shorthand for logLevel='debug' (backwards compatible)
 * @param {boolean} [options.color] - Enable colored output
 * @param {boolean} [options.silent] - Suppress all output
 * @param {string} [options.logFile] - Path to log file
 * @param {boolean} [options.resetTimer] - Reset the start timer (default: true)
 */
export function configure(options = {}) {
  // Handle --json flag: can be boolean or string of fields
  if (options.json !== undefined) {
    config.json = !!options.json; // Truthy check for JSON mode
    config.jsonFields = parseJsonFields(options.json);
  }
  if (options.jsonFields !== undefined) config.jsonFields = options.jsonFields;
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
 * Show command header with distinctive branding
 * Uses Observatory's signature amber color for "vizzly"
 * Only shows once per command execution
 * @param {string} command - Command name (e.g., 'tdd', 'run')
 * @param {string} [mode] - Optional mode (e.g., 'local', 'cloud')
 */
export function header(command, mode = null) {
  if (config.json || config.silent || headerShown) return;
  headerShown = true;

  let parts = [];

  // Brand "vizzly" with Observatory's signature amber
  parts.push(colors.brand.amber(colors.bold('vizzly')));

  // Command in info blue (processing, active)
  parts.push(colors.brand.info(command));

  // Mode (if provided) in muted text
  if (mode) {
    parts.push(colors.brand.textTertiary(mode));
  }

  console.error('');
  console.error(parts.join(colors.brand.textMuted(' · ')));
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
  writeLog('info', message, { status: 'success', ...data });
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
  writeLog('info', message, data);
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
  writeLog('warn', message, data);
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
 * When field selection is active, only specified fields are included
 * @param {Object|Array} obj - Data to output
 */
export function data(obj) {
  let output = config.jsonFields ? selectFields(obj, config.jsonFields) : obj;

  if (config.json) {
    console.log(JSON.stringify({ status: 'data', data: output }));
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

/**
 * Get configured JSON fields (for commands that need direct access)
 * @returns {string[]|null} Array of field names, or null for all fields
 */
export function getJsonFields() {
  return config.jsonFields;
}

// ============================================================================
// Spinner / Progress (stderr so it doesn't pollute piped output)
// ============================================================================

/**
 * Start a spinner with message
 * Uses Observatory amber for the spinner animation
 */
export function startSpinner(message) {
  if (config.json || config.silent || !process.stderr.isTTY) return;

  stopSpinner();
  spinnerMessage = message;

  // Braille dots spinner - smooth animation
  let frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  spinnerInterval = setInterval(() => {
    let frame = frames[i++ % frames.length];
    // Use amber brand color for spinner, plain text for message (better readability)
    let line = `  ${colors.brand.amber(frame)} ${spinnerMessage}`;

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

  let progressText =
    total > 0 ? ` ${colors.brand.textMuted(`(${current}/${total})`)}` : '';
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
/**
 * Get a distinctive color for a component name
 * Uses Observatory design system colors for consistent styling
 * @param {string} component - Component name
 * @returns {Function} Color function
 */
function getComponentColor(component) {
  // Map components to Observatory semantic colors
  let componentColors = {
    // Server/infrastructure - success green (active, running)
    server: colors.brand.success,
    baseline: colors.brand.success,
    // TDD/comparison - info blue (processing, informational)
    tdd: colors.brand.info,
    compare: colors.brand.info,
    // Config/auth - warning amber (attention, configuration)
    config: colors.brand.warning,
    build: colors.brand.warning,
    auth: colors.brand.warning,
    // Upload/API - info blue (processing)
    upload: colors.brand.info,
    api: colors.brand.info,
    // Run - amber (primary action)
    run: colors.brand.amber,
  };

  return componentColors[component] || colors.brand.info;
}

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
      // Component-based format with distinctive colors
      // "  server   ready on :47392"
      let paddedComponent = component.padEnd(8);
      let componentColor = getComponentColor(component);
      // Use plain text for message (better readability on dark backgrounds)
      console.error(
        `  ${componentColor(paddedComponent)} ${message}${dataStr}`
      );
    } else {
      // Simple format for legacy calls
      console.error(`  ${colors.dim('•')} ${message}${dataStr}`);
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
// Visual formatting helpers
// ============================================================================

/**
 * Generate a visual diff bar with color coding
 * Shows percentage as a filled/empty bar with color based on severity
 * Uses Observatory semantic colors (success → warning → danger)
 * @param {number} percentage - Diff percentage (0-100)
 * @param {number} [width=10] - Bar width in characters
 * @returns {string} Colored diff bar string
 *
 * @example
 * diffBar(4.2)  // Returns "████░░░░░░" in warning amber
 * diffBar(0.5)  // Returns "█░░░░░░░░░" in success green
 * diffBar(15.0) // Returns "██░░░░░░░░" in danger red
 */
export function diffBar(percentage, width = 10) {
  if (config.json || config.silent) return '';

  // Calculate filled blocks - ensure at least 1 filled for non-zero percentages
  let filled = Math.round((percentage / 100) * width);
  if (percentage > 0 && filled === 0) filled = 1;
  let empty = width - filled;

  // Color based on severity using Observatory semantic colors
  let barColor;
  if (percentage < 1) {
    barColor = colors.brand.success; // Green - minimal change
  } else if (percentage < 5) {
    barColor = colors.brand.warning; // Amber - attention needed
  } else {
    barColor = colors.brand.danger; // Red - significant change
  }

  let filledPart = barColor('█'.repeat(filled));
  let emptyPart = colors.brand.textMuted('░'.repeat(empty));

  return `${filledPart}${emptyPart}`;
}

/**
 * Generate a gradient progress bar
 * Creates a visually appealing progress indicator with color gradient
 * Default gradient uses Observatory amber → amber-light (signature brand gradient)
 * @param {number} current - Current progress value
 * @param {number} total - Total value
 * @param {number} [width=20] - Bar width in characters
 * @param {Object} [options] - Gradient options
 * @param {string} [options.from='#F59E0B'] - Start color (hex) - default: amber
 * @param {string} [options.to='#FBBF24'] - End color (hex) - default: amber-light
 * @returns {string} Gradient progress bar string
 */
export function progressBar(current, total, width = 20, options = {}) {
  if (config.json || config.silent) return '';

  // Default to Observatory's signature amber gradient
  let { from = '#F59E0B', to = '#FBBF24' } = options;

  let percent = Math.min(100, Math.max(0, (current / total) * 100));
  let filled = Math.round((percent / 100) * width);
  let empty = width - filled;

  // Parse hex colors
  let fromRgb = hexToRgb(from);
  let toRgb = hexToRgb(to);

  // Build gradient
  let bar = '';
  for (let i = 0; i < filled; i++) {
    let ratio = filled > 1 ? i / (filled - 1) : 0;
    let r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * ratio);
    let g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * ratio);
    let b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * ratio);
    bar += colors.rgb(r, g, b)('█');
  }

  bar += colors.dim('░'.repeat(empty));

  return bar;
}

/**
 * Parse hex color to RGB object
 * @param {string} hex - Hex color string (e.g., '#FF0000' or 'FF0000')
 * @returns {{r: number, g: number, b: number}} RGB values
 */
function hexToRgb(hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 128, g: 128, b: 128 };
}

/**
 * Create a colored badge/pill for status indicators
 * Uses Observatory semantic colors for consistent meaning
 * @param {string} text - Badge text
 * @param {string} [type='info'] - Badge type: 'success', 'warning', 'error', 'info'
 * @returns {string} Formatted badge string
 *
 * @example
 * badge('READY', 'success')  // Success green background
 * badge('FAIL', 'error')     // Danger red background
 * badge('SYNC', 'warning')   // Warning amber background
 */
export function badge(text, type = 'info') {
  if (config.json || config.silent) return text;

  let bgColor;
  let fgColor = colors.black;

  switch (type) {
    case 'success':
      bgColor = colors.brand.bgSuccess;
      break;
    case 'warning':
      bgColor = colors.brand.bgWarning;
      break;
    case 'error':
      bgColor = colors.brand.bgDanger;
      fgColor = colors.white;
      break;
    default:
      bgColor = colors.brand.bgInfo;
      fgColor = colors.white;
      break;
  }

  return bgColor(fgColor(` ${text} `));
}

/**
 * Create a colored status dot
 * Uses Observatory semantic colors for consistent meaning
 * @param {string} [status='info'] - Status type: 'success', 'warning', 'error', 'info'
 * @returns {string} Colored dot character
 */
export function statusDot(status = 'info') {
  if (config.json || config.silent) return '●';

  switch (status) {
    case 'success':
      return colors.brand.success('●');
    case 'warning':
      return colors.brand.warning('●');
    case 'error':
      return colors.brand.danger('●');
    default:
      return colors.brand.info('●');
  }
}

/**
 * Format a link with styling
 * @param {string} label - Link label (not currently used, for future OSC 8 support)
 * @param {string} url - URL to display
 * @returns {string} Styled URL string
 */
export function link(_label, url) {
  if (config.json) return url;
  if (config.silent) return '';

  // Style the URL with underline and info blue
  return colors.brand.info(colors.underline(url));
}

/**
 * Print a labeled value with consistent formatting
 * Useful for displaying key-value pairs in verbose output
 * @param {string} label - The label (will be styled as tertiary text)
 * @param {string} value - The value to display
 * @param {Object} [options] - Display options
 * @param {number} [options.indent=2] - Number of spaces to indent
 */
export function labelValue(label, value, options = {}) {
  if (config.json || config.silent) return;

  let { indent = 2 } = options;
  let padding = ' '.repeat(indent);
  console.log(`${padding}${colors.brand.textTertiary(`${label}:`)} ${value}`);
}

/**
 * Print a hint/tip with muted styling
 * @param {string} text - The hint text
 * @param {Object} [options] - Display options
 * @param {number} [options.indent=2] - Number of spaces to indent
 */
export function hint(text, options = {}) {
  if (config.json || config.silent) return;

  let { indent = 2 } = options;
  let padding = ' '.repeat(indent);
  console.log(`${padding}${colors.brand.textMuted(text)}`);
}

/**
 * Print a list of items with bullet points
 * @param {string[]} items - Array of items to display
 * @param {Object} [options] - Display options
 * @param {number} [options.indent=2] - Number of spaces to indent
 * @param {string} [options.bullet='•'] - Bullet character
 * @param {string} [options.style='default'] - Style: 'default', 'success', 'warning', 'error'
 */
export function list(items, options = {}) {
  if (config.json || config.silent) return;

  let { indent = 2, bullet = '•', style = 'default' } = options;
  let padding = ' '.repeat(indent);

  let bulletColor;
  switch (style) {
    case 'success':
      bulletColor = colors.brand.success;
      bullet = '✓';
      break;
    case 'warning':
      bulletColor = colors.brand.warning;
      bullet = '!';
      break;
    case 'error':
      bulletColor = colors.brand.danger;
      bullet = '✗';
      break;
    default:
      bulletColor = colors.brand.textMuted;
  }

  for (let item of items) {
    console.log(`${padding}${bulletColor(bullet)} ${item}`);
  }
}

/**
 * Print a success/completion message with checkmark
 * @param {string} message - The success message
 * @param {Object} [options] - Display options
 * @param {string} [options.detail] - Optional detail text (shown dimmed)
 */
export function complete(message, options = {}) {
  if (config.silent) return;

  let { detail } = options;
  let detailStr = detail ? ` ${colors.brand.textMuted(detail)}` : '';

  if (config.json) {
    console.log(JSON.stringify({ status: 'complete', message, detail }));
  } else {
    console.log(`  ${colors.brand.success('✓')} ${message}${detailStr}`);
  }
}

/**
 * Print a simple key-value table
 * @param {Object} data - Object with key-value pairs to display
 * @param {Object} [options] - Display options
 * @param {number} [options.indent=2] - Number of spaces to indent
 * @param {number} [options.keyWidth=12] - Width for key column
 */
export function keyValue(data, options = {}) {
  if (config.json || config.silent) return;

  let { indent = 2, keyWidth = 12 } = options;
  let padding = ' '.repeat(indent);

  for (let [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    let paddedKey = key.padEnd(keyWidth);
    console.log(`${padding}${colors.brand.textTertiary(paddedKey)} ${value}`);
  }
}

/**
 * Print a divider line
 * @param {Object} [options] - Display options
 * @param {number} [options.width=40] - Width of the divider
 * @param {string} [options.char='─'] - Character to use for divider
 */
export function divider(options = {}) {
  if (config.json || config.silent) return;

  let { width = 40, char = '─' } = options;
  console.log(colors.brand.textMuted(char.repeat(width)));
}

/**
 * Create a styled box around content
 * Uses Unicode box-drawing characters for clean terminal rendering
 * Features brand-colored borders and titles
 *
 * @param {string|string[]} content - Content to display (string or array of lines)
 * @param {Object} [options] - Box options
 * @param {string} [options.title] - Optional title for the box
 * @param {number} [options.padding=1] - Horizontal padding inside the box
 * @param {Function} [options.borderColor] - Color function for the border
 * @param {string} [options.style='default'] - Box style: 'default', 'branded'
 * @returns {string} Formatted box string
 *
 * @example
 * box('Dashboard: http://localhost:47392')
 * // ╭───────────────────────────────────────╮
 * // │  Dashboard: http://localhost:47392    │
 * // ╰───────────────────────────────────────╯
 *
 * @example
 * box(['Line 1', 'Line 2'], { title: 'Info', style: 'branded' })
 */
export function box(content, options = {}) {
  if (config.json || config.silent) return '';

  let {
    title = null,
    padding = 1,
    borderColor = null,
    style = 'default',
  } = options;
  let lines = Array.isArray(content) ? content : [content];

  // Strip ANSI codes for width calculation
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence matching
  let stripAnsi = str => str.replace(/\x1b\[[0-9;]*m/g, '');

  // Calculate max width (content + padding on each side)
  let maxContentWidth = Math.max(...lines.map(line => stripAnsi(line).length));
  let innerWidth = maxContentWidth + padding * 2;

  // If title provided, ensure box is wide enough
  if (title) {
    let titleWidth = stripAnsi(title).length + 4; // " title " with spaces
    innerWidth = Math.max(innerWidth, titleWidth);
  }

  // Border styling - use Observatory amber for 'branded' style
  let border =
    borderColor || (style === 'branded' ? colors.brand.amber : colors.dim);
  let titleColor = style === 'branded' ? colors.bold : s => s;

  // Build the box
  let result = [];

  // Top border with optional title
  if (title) {
    let titleStr = ` ${titleColor(title)} `;
    let leftDash = '─'.repeat(1);
    let rightDash = '─'.repeat(innerWidth - stripAnsi(title).length - 3);
    result.push(border(`╭${leftDash}`) + titleStr + border(`${rightDash}╮`));
  } else {
    result.push(border(`╭${'─'.repeat(innerWidth)}╮`));
  }

  // Content lines
  let paddingStr = ' '.repeat(padding);
  for (let line of lines) {
    let lineWidth = stripAnsi(line).length;
    let rightPad = ' '.repeat(innerWidth - lineWidth - padding * 2);
    result.push(
      border('│') + paddingStr + line + rightPad + paddingStr + border('│')
    );
  }

  // Bottom border
  result.push(border(`╰${'─'.repeat(innerWidth)}╯`));

  return result.join('\n');
}

/**
 * Print a box to stderr
 * Convenience wrapper around box() that prints directly
 *
 * @param {string|string[]} content - Content to display
 * @param {Object} [options] - Box options (see box())
 */
export function printBox(content, options = {}) {
  if (config.json || config.silent) return;

  let boxStr = box(content, options);
  if (boxStr) {
    console.error(boxStr);
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
  config.jsonFields = null;
  config.logLevel = null;
  config.color = undefined; // Reset to auto-detect
  config.silent = false;
  config.logFile = null;
  colors = createColors({ useColor: config.color });
  startTime = Date.now();
  headerShown = false;
}
