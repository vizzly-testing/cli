// Zero-dependency color helper using raw ANSI codes.
// Detects terminal color support and emits codes only when enabled.

function supportsColorDefault() {
  // Respect NO_COLOR: https://no-color.org/
  if ('NO_COLOR' in process.env) return false;

  // Respect FORCE_COLOR if set to a truthy value (except '0')
  if ('FORCE_COLOR' in process.env) {
    const v = process.env.FORCE_COLOR;
    if (v && v !== '0') return true;
    if (v === '0') return false;
  }

  // If stdout is not a TTY, assume no color
  if (!process.stdout || !process.stdout.isTTY) return false;

  // Prefer getColorDepth when available
  try {
    const depth =
      typeof process.stdout.getColorDepth === 'function'
        ? process.stdout.getColorDepth()
        : 1;
    return depth && depth > 1;
  } catch {
    // Fallback heuristic
    return true;
  }
}

function styleFn(open, close, enabled) {
  return (input = '') => {
    const str = String(input);
    if (!enabled) return str;
    return open + str + close;
  };
}

export function createColors(options = {}) {
  const enabled =
    options.useColor !== undefined
      ? !!options.useColor
      : supportsColorDefault();

  const codes = {
    reset: ['\x1b[0m', ''],
    bold: ['\x1b[1m', '\x1b[22m'],
    dim: ['\x1b[2m', '\x1b[22m'],
    italic: ['\x1b[3m', '\x1b[23m'],
    underline: ['\x1b[4m', '\x1b[24m'],
    strikethrough: ['\x1b[9m', '\x1b[29m'],
    red: ['\x1b[31m', '\x1b[39m'],
    green: ['\x1b[32m', '\x1b[39m'],
    yellow: ['\x1b[33m', '\x1b[39m'],
    blue: ['\x1b[34m', '\x1b[39m'],
    magenta: ['\x1b[35m', '\x1b[39m'],
    cyan: ['\x1b[36m', '\x1b[39m'],
    white: ['\x1b[37m', '\x1b[39m'],
    gray: ['\x1b[90m', '\x1b[39m'],
  };

  const api = {};
  for (const [name, [open, close]] of Object.entries(codes)) {
    api[name] = styleFn(open, close || '\x1b[0m', enabled);
  }

  // Semantic aliases
  api.success = api.green;
  api.error = api.red;
  api.warning = api.yellow;
  api.info = api.blue;

  return api;
}

// Default export with auto-detected color support
export const colors = createColors();
