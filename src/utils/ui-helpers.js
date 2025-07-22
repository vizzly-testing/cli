/**
 * Color and styling utilities for Ink components
 */

/**
 * Check if colors should be used
 */
export function shouldUseColors(flags = {}) {
  return (
    !flags.noColor &&
    !process.env.NO_COLOR &&
    process.stdout.isTTY &&
    process.env.TERM !== 'dumb'
  );
}

/**
 * Get color for text based on type and color support
 */
export function getColor(type, flags = {}) {
  if (!shouldUseColors(flags)) {
    return undefined; // No color
  }

  const colors = {
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'blue',
    progress: 'cyan',
    dim: 'gray',
  };

  return colors[type];
}

/**
 * Get status icon with fallback for no-color mode
 */
export function getStatusIcon(status, flags = {}) {
  if (shouldUseColors(flags)) {
    // Colored emoji icons
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      progress: '🔄',
      uploading: '📤',
      waiting: '⏳',
      running: '🧪',
      starting: '🚀',
    };
    return icons[status] || '•';
  } else {
    // Text-only fallback
    const icons = {
      success: '[OK]',
      error: '[ERR]',
      warning: '[WARN]',
      progress: '[...]',
      uploading: '[UP]',
      waiting: '[WAIT]',
      running: '[RUN]',
      starting: '[START]',
    };
    return icons[status] || '[•]';
  }
}

/**
 * Responsive layout helper
 */
export function getLayout(columns = process.stdout.columns || 80) {
  if (columns < 60) {
    return {
      type: 'compact',
      showDetails: false,
      maxWidth: columns - 4,
    };
  } else if (columns < 100) {
    return {
      type: 'normal',
      showDetails: true,
      maxWidth: columns - 8,
    };
  } else {
    return {
      type: 'wide',
      showDetails: true,
      maxWidth: Math.min(columns - 16, 120),
    };
  }
}
