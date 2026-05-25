/**
 * VariantBreadcrumb Component
 * BearDen Design System
 *
 * A responsive dimension navigator for screenshot variants.
 *
 * Desktop: Inline breadcrumb with clickable segments and dropdowns
 * Mobile: Compact button that opens a full variant selector sheet
 *
 * Features:
 * - Shows ALL dimensions (even single-value for context)
 * - Smart icons per dimension type
 * - Keyboard accessible
 * - Mobile-first responsive design
 */

import {
  ChevronDownIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  GlobeAltIcon,
  MoonIcon,
  SunIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserIcon as BrowserIconComponent } from './browser-icon.jsx';
import { DrawerContent, DrawerHeader, MobileDrawer } from './mobile-drawer.jsx';
import { getScreenshotMetadata } from './screenshot-metadata.js';

/**
 * Default dimensions to always consider
 */
let DEFAULT_DIMENSIONS = ['viewport', 'browser'];

/**
 * Dimension configuration
 */
let dimensionConfig = {
  viewport: {
    label: 'Size',
    getValue: comparison => {
      let w = comparison.viewport_width || comparison.width;
      let h = comparison.viewport_height || comparison.height;
      return w && h ? `${w}x${h}` : null;
    },
    formatValue: value => value?.replace('x', '×'),
    sortValues: (a, b) => {
      let [aW] = (a || '0x0').split('x').map(Number);
      let [bW] = (b || '0x0').split('x').map(Number);
      return bW - aW;
    },
    renderIcon: (value, className = 'w-3.5 h-3.5') => {
      let width = parseInt(value?.split('x')[0], 10) || 0;
      if (width <= 480) return <DevicePhoneMobileIcon className={className} />;
      if (width <= 1024) return <DeviceTabletIcon className={className} />;
      return <ComputerDesktopIcon className={className} />;
    },
    isMono: true,
  },
  browser: {
    label: 'Browser',
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.browser || comparison.browser || null;
    },
    formatValue: value => value?.charAt(0).toUpperCase() + value?.slice(1),
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
    renderIcon: (value, className = 'w-3.5 h-3.5') => (
      <BrowserIconComponent browser={value} className={className} />
    ),
  },
  theme: {
    label: 'Theme',
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
    renderIcon: (value, className = 'w-3.5 h-3.5') =>
      value?.toLowerCase() === 'dark' ? (
        <MoonIcon className={className} />
      ) : (
        <SunIcon className={className} />
      ),
  },
  locale: {
    label: 'Locale',
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.locale || null;
    },
    formatValue: value => value?.toUpperCase(),
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
    renderIcon: (_value, className = 'w-3.5 h-3.5') => (
      <GlobeAltIcon className={className} />
    ),
  },
  device: {
    label: 'Device',
    getValue: comparison => {
      let metadata = getScreenshotMetadata(comparison);
      return metadata.device || null;
    },
    formatValue: value => value,
    sortValues: (a, b) => (a || '').localeCompare(b || ''),
    renderIcon: (_value, className = 'w-3.5 h-3.5') => (
      <DevicePhoneMobileIcon className={className} />
    ),
  },
};

/**
 * Get dimension value from comparison
 */
function getDimensionValue(comparison, dimension) {
  let config = dimensionConfig[dimension];
  if (config) return config.getValue(comparison);
  let metadata = getScreenshotMetadata(comparison);
  return metadata[dimension] || comparison[dimension] || null;
}

/**
 * Format dimension value for display
 */
function formatDimensionValue(
  dimension,
  value,
  includeKey = false,
  maxLength = 14
) {
  let config = dimensionConfig[dimension];

  // Format the value itself
  let formattedValue;
  if (config?.formatValue) {
    formattedValue = config.formatValue(value);
  } else if (value === null || value === undefined) {
    formattedValue = 'none';
  } else if (typeof value === 'boolean') {
    formattedValue = String(value);
  } else if (typeof value === 'number') {
    formattedValue = String(value);
  } else if (typeof value === 'object') {
    formattedValue = JSON.stringify(value);
  } else {
    formattedValue = value;
  }

  // Truncate long values
  if (formattedValue && formattedValue.length > maxLength) {
    formattedValue = `${formattedValue.slice(0, maxLength - 1)}…`;
  }

  // For custom properties (not in config), show key: value
  if (includeKey && !config) {
    let label = getDimensionLabel(dimension).toLowerCase();
    return `${label}: ${formattedValue}`;
  }

  return formattedValue;
}

/**
 * Sort dimension values
 */
function sortDimensionValues(dimension, values) {
  let config = dimensionConfig[dimension];
  return config?.sortValues ? [...values].sort(config.sortValues) : values;
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
 * Render icon for a dimension - uses config or falls back to TagIcon
 */
function renderDimensionIcon(dimension, value, className = 'w-4 h-4') {
  let config = dimensionConfig[dimension];
  if (config?.renderIcon) {
    return config.renderIcon(value, className);
  }
  return <TagIcon className={className} />;
}

/**
 * Hook to analyze variant dimensions
 * Shared logic between desktop breadcrumb and mobile sheet
 */
export function useVariantDimensions(
  variants,
  baselineSignatureProperties = []
) {
  // Auto-discover dimensions from variant data
  let effectiveDimensions = useMemo(() => {
    let dims = [...DEFAULT_DIMENSIONS];

    baselineSignatureProperties.forEach(prop => {
      if (!dims.includes(prop)) dims.push(prop);
    });

    let knownDimensions = Object.keys(dimensionConfig);
    knownDimensions.forEach(dim => {
      if (dims.includes(dim)) return;
      let hasValue = variants.some(
        variant => getDimensionValue(variant, dim) != null
      );
      if (hasValue) dims.push(dim);
    });

    let skipKeys = [
      'browser',
      'viewport',
      'viewportWidth',
      'viewportHeight',
      'device',
      'url',
      'selector',
      'width',
      'height',
    ];
    variants.forEach(variant => {
      let metadata = getScreenshotMetadata(variant);
      Object.keys(metadata).forEach(key => {
        if (
          !dims.includes(key) &&
          !skipKeys.includes(key) &&
          metadata[key] != null &&
          typeof metadata[key] !== 'object'
        ) {
          dims.push(key);
        }
      });
    });

    return dims;
  }, [baselineSignatureProperties, variants]);

  // Analyze variants by dimension
  let dimensionAnalysis = useMemo(() => {
    if (!variants || variants.length === 0) return {};

    let analysis = {};
    effectiveDimensions.forEach(dim => {
      let valueSet = new Set();
      variants.forEach(variant => {
        let value = getDimensionValue(variant, dim);
        if (value != null) valueSet.add(value);
      });

      if (valueSet.size >= 1) {
        analysis[dim] = {
          values: Array.from(valueSet),
          hasMultiple: valueSet.size > 1,
        };
      }
    });

    return analysis;
  }, [variants, effectiveDimensions]);

  return { effectiveDimensions, dimensionAnalysis };
}

/**
 * Find best matching variant when changing one dimension
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
    if (getDimensionValue(variant, changeDim) !== newValue) return;

    let score = 0;
    allDimensions.forEach(dim => {
      if (dim === changeDim) return;
      let currentVal = currentVariant
        ? getDimensionValue(currentVariant, dim)
        : null;
      let variantVal = getDimensionValue(variant, dim);
      if (currentVal === variantVal) score++;
    });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = variant;
    }
  });

  if (!bestMatch) {
    bestMatch = variants.find(
      v => getDimensionValue(v, changeDim) === newValue
    );
  }

  return bestMatch;
}

/**
 * Individual breadcrumb segment with dropdown (desktop only)
 */
function BreadcrumbSegment({
  dimension,
  currentValue,
  allValues,
  onSelect,
  isLast,
}) {
  let [isOpen, setIsOpen] = useState(false);
  let segmentRef = useRef(null);
  let dropdownRef = useRef(null);

  let config = dimensionConfig[dimension];
  let hasMultiple = allValues.length > 1;
  let displayValue = formatDimensionValue(dimension, currentValue, true);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (
        segmentRef.current &&
        !segmentRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleEscape(e) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  let handleSelect = useCallback(
    value => {
      onSelect(dimension, value);
      setIsOpen(false);
    },
    [dimension, onSelect]
  );

  return (
    <div className="relative flex items-center flex-shrink-0" ref={segmentRef}>
      <button
        type="button"
        onClick={() => hasMultiple && setIsOpen(!isOpen)}
        disabled={!hasMultiple}
        className={`
          group flex items-center gap-1.5 px-2 py-1 rounded-md
          text-sm transition-all duration-150 whitespace-nowrap
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-brand)]
          ${hasMultiple ? 'hover:bg-[var(--vz-border-subtle)] cursor-pointer' : 'cursor-default opacity-75'}
          ${isOpen ? 'bg-[var(--vz-border-subtle)] ring-1 ring-[var(--vz-border-strong)]' : ''}
        `}
        aria-expanded={isOpen}
        aria-haspopup={hasMultiple ? 'listbox' : undefined}
      >
        <span
          className={`transition-colors ${isOpen ? 'text-[var(--accent-warning)]' : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]'}`}
        >
          {renderDimensionIcon(dimension, currentValue, 'w-4 h-4')}
        </span>
        <span
          className={`transition-colors ${isOpen ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)] group-hover:text-[var(--text-primary)]'} ${config?.isMono ? 'font-mono text-xs' : 'text-sm'}`}
        >
          {displayValue || 'Unknown'}
        </span>
        {hasMultiple && (
          <ChevronDownIcon
            className={`w-3 h-3 transition-all duration-150 ${isOpen ? 'text-[var(--accent-warning)] rotate-180' : 'text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)]'}`}
          />
        )}
      </button>

      {!isLast && (
        <span className="mx-0.5 text-[var(--text-muted)] select-none opacity-40">
          /
        </span>
      )}

      {isOpen && hasMultiple && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] max-h-[280px] overflow-y-auto bg-[var(--vz-surface)] backdrop-blur-sm border border-[var(--vz-border)] rounded-lg shadow-xl shadow-black/40 py-1 animate-in fade-in slide-in-from-top-2 duration-150"
          role="listbox"
          aria-label={`Select ${getDimensionLabel(dimension)}`}
        >
          <div className="px-3 py-2 border-b border-[var(--vz-border-subtle)]">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {getDimensionLabel(dimension)}
            </span>
          </div>
          {sortDimensionValues(dimension, allValues).map(value => {
            let isSelected = value === currentValue;
            let optionDisplay = formatDimensionValue(dimension, value);

            return (
              <button
                type="button"
                key={value}
                onClick={() => handleSelect(value)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-brand)] ${isSelected ? 'bg-[var(--accent-warning-muted)] text-[var(--accent-warning)]' : 'text-[var(--text-secondary)] hover:bg-[var(--vz-border-subtle)] hover:text-[var(--text-primary)]'}`}
                role="option"
                aria-selected={isSelected}
              >
                <span
                  className={
                    isSelected
                      ? 'text-[var(--accent-warning)]'
                      : 'text-[var(--text-muted)]'
                  }
                >
                  {renderDimensionIcon(dimension, value, 'w-4 h-4')}
                </span>
                <span
                  className={`flex-1 ${config?.isMono ? 'font-mono text-xs' : 'text-sm'}`}
                >
                  {optionDisplay}
                </span>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brand)] shadow-sm shadow-[var(--accent-brand-muted)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Mobile variant sheet content - dimension-by-dimension selection
 */
function MobileVariantSheet({
  isOpen,
  onClose,
  variants,
  currentVariant,
  dimensionAnalysis,
  effectiveDimensions,
  onVariantSelect,
}) {
  let handleDimensionChange = useCallback(
    (dimension, newValue) => {
      let target = findBestMatch(
        variants,
        dimension,
        newValue,
        currentVariant,
        effectiveDimensions
      );
      if (target && onVariantSelect) {
        onVariantSelect(target);
        onClose();
      }
    },
    [variants, currentVariant, effectiveDimensions, onVariantSelect, onClose]
  );

  let activeDimensions = Object.keys(dimensionAnalysis);
  let multiValueDimensions = activeDimensions.filter(
    dim => dimensionAnalysis[dim].hasMultiple
  );
  let singleValueDimensions = activeDimensions.filter(
    dim => !dimensionAnalysis[dim].hasMultiple
  );
  let sortedDimensions = [...multiValueDimensions, ...singleValueDimensions];

  return (
    <MobileDrawer
      isOpen={isOpen}
      onClose={onClose}
      position="bottom"
      desktopPosition="none"
      mobileHeight="30vh"
      expandedHeight="80vh"
    >
      <DrawerHeader title="Select Variant" onClose={onClose} />
      <DrawerContent className="px-3 py-3">
        <div className="space-y-5">
          {sortedDimensions.map(dim => {
            let { values, hasMultiple } = dimensionAnalysis[dim];
            let currentValue = currentVariant
              ? getDimensionValue(currentVariant, dim)
              : values[0];
            let label = getDimensionLabel(dim);

            return (
              <div key={dim}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    {label}
                  </span>
                  {!hasMultiple && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      (fixed)
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {sortDimensionValues(dim, values).map(value => {
                    let isActive = currentValue === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!hasMultiple}
                        onClick={() =>
                          hasMultiple && handleDimensionChange(dim, value)
                        }
                        className={`
                          flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all
                          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-brand)]
                          ${!hasMultiple ? 'opacity-60 cursor-default' : 'active:scale-[0.98]'}
                          ${
                            isActive
                              ? 'bg-[var(--accent-warning-muted)] text-[var(--accent-warning)] ring-1 ring-[var(--accent-warning-muted)]'
                              : hasMultiple
                                ? 'bg-[var(--vz-raised)] text-[var(--text-secondary)] hover:bg-[var(--vz-border-subtle)] active:bg-[var(--vz-border-subtle)]'
                                : 'bg-[var(--vz-raised)] text-[var(--text-tertiary)]'
                          }
                        `}
                      >
                        {renderDimensionIcon(dim, value, 'w-4 h-4')}
                        <span
                          className={
                            dimensionConfig[dim]?.isMono
                              ? 'font-mono text-xs'
                              : ''
                          }
                        >
                          {formatDimensionValue(dim, value)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </MobileDrawer>
  );
}

/**
 * Main VariantBreadcrumb component - responsive
 *
 * Desktop: Inline breadcrumb with dropdowns
 * Mobile: Compact button that opens variant sheet
 */
export function VariantBreadcrumb({
  variants = [],
  currentVariantId,
  onVariantSelect,
  baselineSignatureProperties = [],
  className = '',
}) {
  let [showMobileSheet, setShowMobileSheet] = useState(false);

  let { effectiveDimensions, dimensionAnalysis } = useVariantDimensions(
    variants,
    baselineSignatureProperties
  );

  let currentVariant = useMemo(
    () => variants.find(v => v.id === currentVariantId),
    [variants, currentVariantId]
  );

  let handleDimensionChange = useCallback(
    (dimension, newValue) => {
      let target = findBestMatch(
        variants,
        dimension,
        newValue,
        currentVariant,
        effectiveDimensions
      );
      if (target && onVariantSelect) {
        onVariantSelect(target);
      }
    },
    [variants, currentVariant, effectiveDimensions, onVariantSelect]
  );

  let activeDimensions = Object.keys(dimensionAnalysis);

  if (variants.length === 0 || activeDimensions.length === 0) {
    return null;
  }

  let multiValueDimensions = activeDimensions.filter(
    dim => dimensionAnalysis[dim].hasMultiple
  );
  let singleValueDimensions = activeDimensions.filter(
    dim => !dimensionAnalysis[dim].hasMultiple
  );
  let sortedDimensions = [...multiValueDimensions, ...singleValueDimensions];

  // Get summary for mobile button
  let viewportValue = currentVariant
    ? getDimensionValue(currentVariant, 'viewport')
    : null;
  let browserValue = currentVariant
    ? getDimensionValue(currentVariant, 'browser')
    : null;

  return (
    <>
      {/* Mobile: Compact button */}
      <button
        type="button"
        onClick={() => setShowMobileSheet(true)}
        className={`
          sm:hidden flex items-center gap-2 px-3 py-1.5
          bg-[var(--vz-raised)] rounded-lg border border-[var(--vz-border-subtle)]
          text-sm text-[var(--text-primary)] hover:bg-[var(--vz-border-subtle)] active:bg-[var(--vz-border-subtle)] transition-colors
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-brand)]
          ${className}
        `}
      >
        {renderDimensionIcon(
          'viewport',
          viewportValue,
          'w-4 h-4 text-[var(--text-tertiary)]'
        )}
        <span className="font-mono text-xs truncate max-w-[100px]">
          {formatDimensionValue('viewport', viewportValue)}
        </span>
        {browserValue && (
          <>
            <span className="text-[var(--text-muted)]">/</span>
            {renderDimensionIcon(
              'browser',
              browserValue,
              'w-4 h-4 text-[var(--text-tertiary)]'
            )}
          </>
        )}
        <ChevronRightIcon className="w-3 h-3 text-[var(--text-muted)] ml-auto" />
      </button>

      {/* Desktop: Inline breadcrumb */}
      <div
        className={`
          hidden sm:flex items-center flex-wrap gap-1
          bg-[var(--vz-raised)] rounded-lg px-1.5 py-1
          border border-[var(--vz-border-subtle)]
          ${className}
        `}
      >
        {sortedDimensions.map((dim, index) => {
          let { values } = dimensionAnalysis[dim];
          let currentValue = currentVariant
            ? getDimensionValue(currentVariant, dim)
            : values[0];

          return (
            <BreadcrumbSegment
              key={dim}
              dimension={dim}
              currentValue={currentValue}
              allValues={values}
              onSelect={handleDimensionChange}
              isLast={index === sortedDimensions.length - 1}
            />
          );
        })}
      </div>

      {/* Mobile sheet */}
      <MobileVariantSheet
        isOpen={showMobileSheet}
        onClose={() => setShowMobileSheet(false)}
        variants={variants}
        currentVariant={currentVariant}
        dimensionAnalysis={dimensionAnalysis}
        effectiveDimensions={effectiveDimensions}
        onVariantSelect={onVariantSelect}
      />
    </>
  );
}

export default VariantBreadcrumb;
