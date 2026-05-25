/**
 * VariantPills Component
 * Observatory Design System
 *
 * A compact, visually rich display of variant metadata for screenshot groups.
 * Used in tables, cards, and anywhere a summary of variants is needed.
 *
 * Features:
 * - Dimension-specific icons and colors
 * - Adaptive display (compact vs full)
 * - Subtle hover interactions
 * - Consistent with VariantStrip/VariantBreadcrumb patterns
 */

import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  GlobeAltIcon,
  MoonIcon,
  Square3Stack3DIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { BrowserIcon } from './browser-icon.jsx';

/**
 * Dimension styling configuration
 * Each dimension has a unique visual identity
 */
let dimensionStyles = {
  variants: {
    bg: 'bg-[var(--vz-raised)]',
    text: 'text-[var(--text-secondary)]',
    border: 'border-[var(--vz-border)]',
    icon: Square3Stack3DIcon,
  },
  browser: {
    bg: 'bg-[var(--vz-raised)]',
    text: 'text-[var(--text-tertiary)]',
    border: 'border-[var(--vz-border-subtle)]',
    renderIcon: values =>
      values.map(b => (
        <BrowserIcon key={b} browser={b} className="w-3.5 h-3.5" />
      )),
  },
  viewport: {
    bg: 'bg-[var(--vz-raised)]',
    text: 'text-[var(--text-tertiary)]',
    border: 'border-[var(--vz-border-subtle)]',
    renderIcon: values => {
      // Show appropriate device icon based on viewport sizes
      let hasDesktop = values.some(v => {
        let w = parseInt(v.split('x')[0], 10);
        return w > 1024;
      });
      let hasTablet = values.some(v => {
        let w = parseInt(v.split('x')[0], 10);
        return w > 480 && w <= 1024;
      });
      let hasMobile = values.some(v => {
        let w = parseInt(v.split('x')[0], 10);
        return w <= 480;
      });

      if (hasDesktop && !hasTablet && !hasMobile) {
        return <ComputerDesktopIcon className="w-3 h-3" />;
      }
      if (hasMobile && !hasDesktop && !hasTablet) {
        return <DevicePhoneMobileIcon className="w-3 h-3" />;
      }
      if (hasTablet && !hasDesktop && !hasMobile) {
        return <DeviceTabletIcon className="w-3 h-3" />;
      }
      // Mixed viewports - show count
      return <ComputerDesktopIcon className="w-3 h-3" />;
    },
  },
  device: {
    bg: 'bg-[var(--accent-media-muted)]',
    text: 'text-[var(--accent-media)]',
    border: 'border-[color-mix(in_srgb,var(--accent-media)_24%,transparent)]',
    icon: DevicePhoneMobileIcon,
  },
  theme: {
    bg: 'bg-[var(--accent-info-muted)]',
    text: 'text-[var(--accent-info)]',
    border: 'border-[color-mix(in_srgb,var(--accent-info)_24%,transparent)]',
    renderIcon: values => {
      let hasDark = values.some(v => v?.toLowerCase() === 'dark');
      let hasLight = values.some(v => v?.toLowerCase() === 'light');
      if (hasDark && hasLight) {
        return (
          <span className="flex items-center -space-x-1">
            <MoonIcon className="w-3 h-3" />
            <SunIcon className="w-3 h-3" />
          </span>
        );
      }
      return hasDark ? (
        <MoonIcon className="w-3 h-3" />
      ) : (
        <SunIcon className="w-3 h-3" />
      );
    },
  },
  locale: {
    bg: 'bg-[var(--accent-media-muted)]',
    text: 'text-[var(--accent-media)]',
    border: 'border-[color-mix(in_srgb,var(--accent-media)_24%,transparent)]',
    icon: GlobeAltIcon,
  },
  os: {
    bg: 'bg-[var(--vz-raised)]',
    text: 'text-[var(--text-tertiary)]',
    border: 'border-[var(--vz-border-subtle)]',
  },
  orientation: {
    bg: 'bg-[var(--vz-raised)]',
    text: 'text-[var(--text-tertiary)]',
    border: 'border-[var(--vz-border-subtle)]',
  },
};

/**
 * Individual pill component
 */
function Pill({
  dimension,
  values,
  count,
  label,
  compact = false,
  className = '',
}) {
  let style = dimensionStyles[dimension] || dimensionStyles.os;
  let Icon = style.icon;

  // Determine what to display
  let displayContent = label;
  if (!displayContent) {
    if (count !== undefined && count > 1) {
      displayContent = `${count} ${dimension}${count !== 1 ? 's' : ''}`;
    } else if (values?.length === 1) {
      displayContent = values[0];
    } else if (values?.length > 1) {
      displayContent = `${values.length}`;
    }
  }

  // Size classes
  let sizeClasses = compact
    ? 'px-1.5 py-0.5 text-[10px] gap-1'
    : 'px-2 py-0.5 text-[11px] gap-1.5';

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded
        border transition-all duration-150
        hover:brightness-110
        ${style.bg} ${style.text} ${style.border}
        ${sizeClasses}
        ${className}
      `}
    >
      {/* Icon - use custom renderer or default icon */}
      {style.renderIcon ? (
        <span className="flex items-center gap-0.5 opacity-80">
          {style.renderIcon(values || [])}
        </span>
      ) : Icon ? (
        <Icon className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      ) : null}

      {/* Label/Value */}
      <span className={dimension === 'viewport' ? 'font-mono' : ''}>
        {displayContent}
      </span>
    </span>
  );
}

/**
 * Browser pill - special handling for browser icons
 */
function BrowserPill({ browsers = [], compact = false }) {
  if (!browsers || browsers.length === 0) return null;

  let style = dimensionStyles.browser;
  let sizeClasses = compact ? 'px-1.5 py-0.5 gap-0.5' : 'px-2 py-1 gap-1';

  return (
    <span
      className={`
        inline-flex items-center rounded
        border transition-all duration-150
        hover:brightness-110
        ${style.bg} ${style.text} ${style.border}
        ${sizeClasses}
      `}
    >
      {browsers.map(browser => (
        <BrowserIcon
          key={browser}
          browser={browser}
          className={compact ? 'w-3 h-3 opacity-80' : 'w-3.5 h-3.5 opacity-80'}
        />
      ))}
    </span>
  );
}

/**
 * Main VariantPills component
 *
 * Displays a collection of metadata pills for a screenshot group
 *
 * @param {number} totalVariants - Total number of variants
 * @param {Array} browsers - Array of browser names
 * @param {Array} viewports - Array of viewport strings (e.g., "1920x1080")
 * @param {Array} devices - Array of device names
 * @param {Object} customProperties - Object with arrays for theme, locale, os, orientation, etc.
 * @param {boolean} compact - Use compact styling
 * @param {boolean} showVariantCount - Whether to show variant count pill
 * @param {string} className - Additional CSS classes
 */
export function VariantPills({
  totalVariants,
  browsers = [],
  viewports = [],
  devices = [],
  customProperties = {},
  compact = false,
  showVariantCount = true,
  className = '',
}) {
  let { theme = [], locale = [], os = [], orientation = [] } = customProperties;

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {/* Variant count */}
      {showVariantCount && totalVariants > 1 && (
        <Pill
          dimension="variants"
          label={`${totalVariants} variant${totalVariants !== 1 ? 's' : ''}`}
          compact={compact}
        />
      )}

      {/* Browsers - special handling for icons */}
      {browsers.length > 0 && (
        <BrowserPill browsers={browsers} compact={compact} />
      )}

      {/* Viewports/Devices - show count if multiple */}
      {viewports.length > 1 && (
        <Pill
          dimension="viewport"
          values={viewports}
          count={viewports.length}
          compact={compact}
        />
      )}

      {/* Named devices */}
      {devices.length > 0 && (
        <Pill
          dimension="device"
          values={devices}
          label={
            devices.length === 1 ? devices[0] : `${devices.length} devices`
          }
          compact={compact}
        />
      )}

      {/* Theme */}
      {theme.length > 0 && (
        <Pill
          dimension="theme"
          values={theme}
          label={theme.length === 1 ? theme[0] : theme.join(', ')}
          compact={compact}
        />
      )}

      {/* Locale */}
      {locale.length > 0 && (
        <Pill
          dimension="locale"
          values={locale}
          label={locale.length === 1 ? locale[0] : `${locale.length} locales`}
          compact={compact}
        />
      )}

      {/* OS */}
      {os.length > 0 && (
        <Pill
          dimension="os"
          values={os}
          label={os.join(', ')}
          compact={compact}
        />
      )}

      {/* Orientation */}
      {orientation.length > 0 && (
        <Pill
          dimension="orientation"
          values={orientation}
          label={orientation.join(', ')}
          compact={compact}
        />
      )}
    </div>
  );
}

/**
 * Single variant pill - for expanded variant rows
 * Shows browser + viewport as a clickable unit
 */
export function VariantIdentifier({
  browser,
  viewport,
  device,
  theme,
  locale,
  compact = false,
  className = '',
}) {
  let sizeClasses = compact ? 'px-2 py-1 gap-1.5' : 'px-2.5 py-1.5 gap-2';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Primary identifier: Browser + Viewport */}
      <span
        className={`
          inline-flex items-center rounded-md
          bg-[var(--vz-raised)] border border-[var(--vz-border-subtle)]
          transition-colors duration-150
          hover:bg-[var(--vz-elevated)]
          ${sizeClasses}
        `}
      >
        {browser && (
          <BrowserIcon browser={browser} className="w-4 h-4 opacity-80" />
        )}
        {viewport && (
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            {viewport}
          </span>
        )}
      </span>

      {/* Secondary properties */}
      {device && (
        <Pill
          dimension="device"
          values={[device]}
          label={device}
          compact={compact}
        />
      )}

      {theme && (
        <Pill
          dimension="theme"
          values={[theme]}
          label={theme}
          compact={compact}
        />
      )}

      {locale && (
        <Pill
          dimension="locale"
          values={[locale]}
          label={locale}
          compact={compact}
        />
      )}
    </div>
  );
}

export { BrowserPill, Pill };
