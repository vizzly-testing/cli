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
  if (!process.stdout?.isTTY) return false;

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

  let colors = new Ansis(level);

  return {
    // Modifiers
    reset: colors.reset,
    bold: colors.bold,
    dim: colors.dim,
    italic: colors.italic,
    underline: colors.underline,
    strikethrough: colors.strikethrough,
    // Basic ANSI colors (fallback)
    red: colors.red,
    green: colors.green,
    yellow: colors.yellow,
    blue: colors.blue,
    magenta: colors.magenta,
    cyan: colors.cyan,
    white: colors.white,
    gray: colors.gray,
    black: colors.black,
    // Semantic aliases (basic)
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    info: colors.blue,
    // Extended colors for rich styling
    rgb: colors.rgb.bind(colors),
    hex: colors.hex.bind(colors),
    bgRgb: colors.bgRgb.bind(colors),
    bgHex: colors.bgHex.bind(colors),
    // Observatory brand colors (Truecolor) - aligned with design system
    brand: {
      // Primary brand color
      amber: colors.hex(brand.amber),
      amberLight: colors.hex(brand.amberLight),
      // Semantic accents
      success: colors.hex(brand.success),
      warning: colors.hex(brand.warning),
      danger: colors.hex(brand.danger),
      info: colors.hex(brand.info),
      // Text hierarchy
      textPrimary: colors.hex(brand.textPrimary),
      textSecondary: colors.hex(brand.textSecondary),
      textTertiary: colors.hex(brand.textTertiary),
      textMuted: colors.hex(brand.textMuted),
      // Background variants
      bgAmber: colors.bgHex(brand.amber),
      bgSuccess: colors.bgHex(brand.success),
      bgWarning: colors.bgHex(brand.warning),
      bgDanger: colors.bgHex(brand.danger),
      bgInfo: colors.bgHex(brand.info),
      // Legacy aliases (backward compatibility)
      green: colors.hex(brand.green),
      red: colors.hex(brand.red),
      cyan: colors.hex(brand.cyan),
      slate: colors.hex(brand.slate),
    },
  };
}

// Default export with auto-detected color support
export let colors = createColors();
