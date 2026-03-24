// Color utility using ansis for rich terminal styling.
// Detects terminal color support and provides chainable color functions.

import { Ansis } from 'ansis';

// =============================================================================
// Vizzly Observatory Design System Colors
// Aligned with @vizzly-testing/observatory color tokens
// =============================================================================

export let brand = {
  // Primary brand color - Amber is Observatory's signature
  amber: '#F59E0B', // Primary brand, actions, highlights
  amberLight: '#FBBF24', // Hover states, emphasis

  // Accent colors (semantic)
  success: '#10B981', // Approved, passed, active (--accent-success)
  warning: '#F59E0B', // Pending, attention (--accent-warning)
  danger: '#EF4444', // Rejected, failed, errors (--accent-danger)
  info: '#3B82F6', // Processing, informational (--accent-info)

  // Surface colors (dark theme)
  bg: '#0F172A', // Page background (--vz-bg)
  surface: '#1A2332', // Cards, panels (--vz-surface)
  elevated: '#1E293B', // Dropdowns, modals (--vz-elevated)
  border: '#374151', // Primary borders (--vz-border)
  borderSubtle: '#2D3748', // Subtle dividers (--vz-border-subtle)

  // Text hierarchy
  textPrimary: '#FFFFFF', // Headings, important (--text-primary)
  textSecondary: '#9CA3AF', // Body text (--text-secondary)
  textTertiary: '#6B7280', // Captions, metadata (--text-tertiary)
  textMuted: '#4B5563', // Disabled, placeholders (--text-muted)

  // Legacy aliases (for backward compatibility)
  green: '#10B981',
  red: '#EF4444',
  cyan: '#06B6D4', // Still useful for links in terminals
  slate: '#64748B',
  dark: '#1E293B',
};

function supportsColorDefault() {
  // Respect NO_COLOR: https://no-color.org/
  if ('NO_COLOR' in process.env) return false;

  // Respect FORCE_COLOR if set to a truthy value (except '0')
  if ('FORCE_COLOR' in process.env) {
    let v = process.env.FORCE_COLOR;
    if (v && v !== '0') return true;
    if (v === '0') return false;
  }

  // COLORTERM indicates truecolor support
  if (
    process.env.COLORTERM === 'truecolor' ||
    process.env.COLORTERM === '24bit'
  ) {
    return true;
  }

  // If stdout is not a TTY, assume no color
  if (!process.stdout || !process.stdout.isTTY) return false;

  // Prefer getColorDepth when available
  try {
    let depth =
      typeof process.stdout.getColorDepth === 'function'
        ? process.stdout.getColorDepth()
        : 1;
    return depth && depth > 1;
  } catch {
    // Fallback heuristic
    return true;
  }
}

/**
 * Create a colors API with optional color support detection
 * @param {Object} options - Configuration options
 * @param {boolean} [options.useColor] - Force color on/off (auto-detect if undefined)
 * @returns {Object} Colors API with styling functions
 */
export function createColors(options = {}) {
  let enabled =
    options.useColor !== undefined
      ? !!options.useColor
      : supportsColorDefault();
  let level =
    options.useColor !== undefined ? (enabled ? 3 : 0) : enabled ? 3 : 0;

  if (!enabled) {
    // Return no-op functions when color disabled
    let noop = (input = '') => String(input);
    return {
      // Modifiers
      reset: noop,
      bold: noop,
      dim: noop,
      italic: noop,
      underline: noop,
      strikethrough: noop,
      // Colors
      red: noop,
      green: noop,
      yellow: noop,
      blue: noop,
      magenta: noop,
      cyan: noop,
      white: noop,
      gray: noop,
      black: noop,
      // Semantic aliases
      success: noop,
      error: noop,
      warning: noop,
      info: noop,
      // Extended colors (return noop factory for chaining)
      rgb: () => noop,
      hex: () => noop,
      bgRgb: () => noop,
      bgHex: () => noop,
      // Observatory brand colors (noop versions)
      brand: {
        // Primary
        amber: noop,
        amberLight: noop,
        // Semantic accents
        success: noop,
        warning: noop,
        danger: noop,
        info: noop,
        // Text hierarchy
        textPrimary: noop,
        textSecondary: noop,
        textTertiary: noop,
        textMuted: noop,
        // Background variants
        bgAmber: noop,
        bgSuccess: noop,
        bgWarning: noop,
        bgDanger: noop,
        bgInfo: noop,
        // Legacy aliases
        green: noop,
        red: noop,
        cyan: noop,
        slate: noop,
      },
    };
  }

  let colorApi = new Ansis(level);

  return {
    // Modifiers
    reset: colorApi.reset,
    bold: colorApi.bold,
    dim: colorApi.dim,
    italic: colorApi.italic,
    underline: colorApi.underline,
    strikethrough: colorApi.strikethrough,
    // Basic ANSI colors (fallback)
    red: colorApi.red,
    green: colorApi.green,
    yellow: colorApi.yellow,
    blue: colorApi.blue,
    magenta: colorApi.magenta,
    cyan: colorApi.cyan,
    white: colorApi.white,
    gray: colorApi.gray,
    black: colorApi.black,
    // Semantic aliases (basic)
    success: colorApi.green,
    error: colorApi.red,
    warning: colorApi.yellow,
    info: colorApi.blue,
    // Extended colors for rich styling
    rgb: colorApi.rgb,
    hex: colorApi.hex,
    bgRgb: colorApi.bgRgb,
    bgHex: colorApi.bgHex,
    // Observatory brand colors (Truecolor) - aligned with design system
    brand: {
      // Primary brand color
      amber: colorApi.hex(brand.amber),
      amberLight: colorApi.hex(brand.amberLight),
      // Semantic accents
      success: colorApi.hex(brand.success),
      warning: colorApi.hex(brand.warning),
      danger: colorApi.hex(brand.danger),
      info: colorApi.hex(brand.info),
      // Text hierarchy
      textPrimary: colorApi.hex(brand.textPrimary),
      textSecondary: colorApi.hex(brand.textSecondary),
      textTertiary: colorApi.hex(brand.textTertiary),
      textMuted: colorApi.hex(brand.textMuted),
      // Background variants
      bgAmber: colorApi.bgHex(brand.amber),
      bgSuccess: colorApi.bgHex(brand.success),
      bgWarning: colorApi.bgHex(brand.warning),
      bgDanger: colorApi.bgHex(brand.danger),
      bgInfo: colorApi.bgHex(brand.info),
      // Legacy aliases (backward compatibility)
      green: colorApi.hex(brand.green),
      red: colorApi.hex(brand.red),
      cyan: colorApi.hex(brand.cyan),
      slate: colorApi.hex(brand.slate),
    },
  };
}

// Default export with auto-detected color support
export let colors = createColors();
