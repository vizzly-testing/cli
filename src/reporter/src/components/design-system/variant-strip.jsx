/**
 * VariantStrip Component
 * Observatory Design System
 *
 * A clean, dimension-grouped variant selector for screenshot comparisons.
 * Focuses purely on navigation between variants - status is shown elsewhere.
 *
 * Features:
 * - Grouped by dimension type (Size, Browser, Theme, etc.)
 * - Smart navigation preserves other dimensions when switching one
 * - Supports custom baseline signature properties
 * - Keyboard accessible
 * - Compact and default variants
 */

import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  GlobeAltIcon,
  LanguageIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { useMemo } from 'react';
import { BrowserIcon as BrowserIconComponent } from './browser-icon.jsx';
import { getScreenshotMetadata } from './screenshot-metadata.js';

/**
 * Default dimensions that are always considered
 */
let DEFAULT_DIMENSIONS = ['viewport', 'browser'];

/**
 * Dimension configuration with icons and formatting
 */
let dimensionConfig = {
  viewport: {
    label: 'Size',
    icon: ComputerDesktopIcon,
    getValue: comparison => {
      let w = comparison.viewport_width || comparison.width;
      let h = comparison.viewport_height || comparison.height;
      return w && h ? `${w}x${h}` : null;
    },
    formatValue: value => value?.replace('x', '×'),
    sortValues: (a, b) => {
      let [aW, aH] = (a || '0x0').split('x').map(Number);
      let [bW, bH] = (b || '0x0').split('x').map(Number);
      return bW * bH - aW * aH; // Largest first
    },
    renderIcon: value => {
      let width = parseInt(value?.split('x')[0], 10) || 0;
      if (width <= 480) {
        return <DevicePhoneMobileIcon className="w-3.5 h-3.5" />;
      } else if (width <= 1024) {
        return <DeviceTabletIcon className="w-3.5 h-3.5" />;
      }
      return <ComputerDesktopIcon className="w-3.5 h-3.5" />;
    },
    isMono: true,
  },
  browser: {
    label: 'Browser',
    icon: GlobeAltIcon,
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.browser || comparison.browser || null;
    },
    formatValue: value => value?.charAt(0).toUpperCase() + value?.slice(1),
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
    renderIcon: value => (
      <BrowserIconComponent browser={value} className="w-3.5 h-3.5" />
    ),
  },
  theme: {
    label: 'Theme',
    icon: MoonIcon,
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.theme || null;
    },
    formatValue: value => value?.charAt(0).toUpperCase() + value?.slice(1),
    sortValues: (a, b) => {
      if (a === 'light') return -1;
      if (b === 'light') return 1;
      return (a || '').localeCompare(b || '');
    },
    renderIcon: value =>
      value?.toLowerCase() === 'dark' ? (
        <MoonIcon className="w-3.5 h-3.5" />
      ) : (
        <SunIcon className="w-3.5 h-3.5" />
      ),
  },
  device: {
    label: 'Device',
    icon: DevicePhoneMobileIcon,
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.device || null;
    },
    formatValue: value => value,
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
  },
  locale: {
    label: 'Locale',
    icon: LanguageIcon,
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.locale || null;
    },
    formatValue: value => value?.toUpperCase(),
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
  },
  orientation: {
    label: 'Orientation',
    icon: DevicePhoneMobileIcon,
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.orientation || null;
    },
    formatValue: value => value?.charAt(0).toUpperCase() + value?.slice(1),
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
  },
};

/**
 * Get dimension value using config
 */
function getDimensionValue(comparison, dimension) {
  let config = dimensionConfig[dimension];
  if (config) {
    return config.getValue(comparison);
  }
  // Fallback for custom dimensions
  let metadata = getScreenshotMetadata(comparison);
  return metadata[dimension] || comparison[dimension] || null;
}

/**
 * Get dimension label
 */
function getDimensionLabel(dimension) {
  return (
    dimensionConfig[dimension]?.label ||
    dimension.charAt(0).toUpperCase() + dimension.slice(1)
  );
}

/**
 * Format dimension value for display
 */
function formatDimensionValue(dimension, value) {
  let config = dimensionConfig[dimension];
  if (config?.formatValue) {
    return config.formatValue(value);
  }
  return value;
}

/**
 * Sort dimension values
 */
function sortDimensionValues(dimension, values) {
  let config = dimensionConfig[dimension];
  if (config?.sortValues) {
    return [...values].sort(config.sortValues);
  }
  return values;
}

/**
 * Individual variant button - clean navigation only
 */
function VariantButton({
  value,
  displayValue,
  dimension,
  isSelected,
  onClick,
  compact = false,
}) {
  // Get dimension-specific icon renderer
  let dimConfig = dimensionConfig[dimension];

  // Size classes based on compact mode
  let sizeClasses = compact
    ? 'px-2.5 py-1 text-xs gap-1.5'
    : 'px-3 py-1.5 text-sm gap-2';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center rounded-md
        font-medium transition-all duration-150
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-brand)]
        ${sizeClasses}
        ${
          isSelected
            ? 'bg-[var(--vz-border-subtle)] text-[var(--text-primary)]'
            : 'bg-[var(--vz-raised)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-border-subtle)]'
        }
      `}
      title={displayValue}
    >
      {/* Dimension icon - use custom renderer if available */}
      {dimConfig?.renderIcon ? (
        <span className={isSelected ? 'opacity-100' : 'opacity-60'}>
          {dimConfig.renderIcon(value)}
        </span>
      ) : null}

      {/* Value */}
      <span className={dimConfig?.isMono ? 'font-mono' : ''}>
        {displayValue}
      </span>
    </button>
  );
}

/**
 * Dimension group container
 */
function DimensionGroup({ label, children, compact = false }) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span
          className={`
            font-medium text-[var(--text-muted)] uppercase tracking-wider
            ${compact ? 'text-[9px]' : 'text-[10px]'}
          `}
        >
          {label}
        </span>
      )}
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1'}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Find best matching variant when changing one dimension
 * Preserves other dimension values as much as possible
 */
function findBestMatch(
  variants,
  changeDim,
  newValue,
  currentVariant,
  allDimensions
) {
  let bestMatch = null;
  let bestScore = -1;

  variants.forEach(variant => {
    // Must match the new dimension value
    if (getDimensionValue(variant, changeDim) !== newValue) {
      return;
    }

    // Calculate match score based on other dimensions
    let score = 0;
    allDimensions.forEach(dim => {
      if (dim === changeDim) return;
      let currentVal = currentVariant
        ? getDimensionValue(currentVariant, dim)
        : null;
      let variantVal = getDimensionValue(variant, dim);
      if (currentVal === variantVal) {
        score++;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = variant;
    }
  });

  // Fallback to first variant with the desired value
  if (!bestMatch) {
    bestMatch = variants.find(
      v => getDimensionValue(v, changeDim) === newValue
    );
  }

  return bestMatch;
}

/**
 * Main VariantStrip component
 *
 * A clean navigation component for switching between screenshot variants.
 * Status indicators are intentionally omitted - use ReviewQueue or Inspector
 * to communicate review state.
 *
 * @param {Array} variants - Array of comparison objects
 * @param {string} currentVariantId - ID of the currently selected variant
 * @param {function} onVariantSelect - Callback when a variant is selected
 * @param {Array} dimensions - Dimensions to display (default: ['viewport', 'browser'])
 * @param {Array} baselineSignatureProperties - Additional dimensions from project config
 * @param {string} className - Additional CSS classes
 * @param {boolean} compact - Use compact styling for tight spaces
 * @param {boolean} showLabels - Show dimension labels
 */
export function VariantStrip({
  variants = [],
  currentVariantId,
  onVariantSelect,
  dimensions,
  baselineSignatureProperties = [],
  className = '',
  compact = false,
  showLabels = true,
}) {
  // Build effective dimensions list
  let effectiveDimensions = useMemo(() => {
    // Start with explicit dimensions or defaults
    let dims = dimensions ? [...dimensions] : [...DEFAULT_DIMENSIONS];

    // Add any baseline signature properties that aren't already included
    baselineSignatureProperties.forEach(prop => {
      if (!dims.includes(prop)) {
        dims.push(prop);
      }
    });

    return dims;
  }, [dimensions, baselineSignatureProperties]);

  // Analyze variants and group by dimension
  let dimensionAnalysis = useMemo(() => {
    if (!variants || variants.length <= 1) return {};

    let analysis = {};

    effectiveDimensions.forEach(dim => {
      let valueSet = new Set();

      variants.forEach(variant => {
        let value = getDimensionValue(variant, dim);
        if (value != null) {
          valueSet.add(value);
        }
      });

      // Only include dimensions with 2+ unique values
      if (valueSet.size > 1) {
        let sortedValues = sortDimensionValues(dim, Array.from(valueSet));
        analysis[dim] = {
          label: getDimensionLabel(dim),
          values: sortedValues,
        };
      }
    });

    return analysis;
  }, [variants, effectiveDimensions]);

  let activeDimensions = Object.keys(dimensionAnalysis);

  // If no variants or only one dimension value across all, don't render
  if (variants.length <= 1 || activeDimensions.length === 0) {
    return null;
  }

  // Find current variant
  let currentVariant = variants.find(v => v.id === currentVariantId);

  return (
    <div
      className={`flex items-center ${compact ? 'gap-4' : 'gap-5'} flex-wrap ${className}`}
    >
      {activeDimensions.map(dim => {
        let { label, values } = dimensionAnalysis[dim];
        let currentDimValue = currentVariant
          ? getDimensionValue(currentVariant, dim)
          : null;

        return (
          <DimensionGroup
            key={dim}
            label={showLabels ? label : ''}
            compact={compact}
          >
            {values.map(value => (
              <VariantButton
                key={value}
                value={value}
                displayValue={formatDimensionValue(dim, value)}
                dimension={dim}
                isSelected={value === currentDimValue}
                compact={compact}
                onClick={() => {
                  let target = findBestMatch(
                    variants,
                    dim,
                    value,
                    currentVariant,
                    effectiveDimensions
                  );
                  if (target && onVariantSelect) {
                    onVariantSelect(target);
                  }
                }}
              />
            ))}
          </DimensionGroup>
        );
      })}
    </div>
  );
}

export {
  DimensionGroup,
  formatDimensionValue,
  getDimensionLabel,
  getDimensionValue,
  VariantButton,
};
