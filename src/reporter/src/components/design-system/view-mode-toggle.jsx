/**
 * ViewModeToggle Component
 * Observatory Design System
 *
 * Toggle between different comparison view modes (overlay, toggle, slide).
 * Mobile-first with icon-only compact variant.
 *
 * Features:
 * - Three view modes: overlay, toggle, onion-skin (slide)
 * - Compact icon-only mode for mobile
 * - Full labels on desktop
 * - Smooth transitions
 */

import {
  ArrowsRightLeftIcon,
  Square2StackIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';

/**
 * View mode configuration
 */
let viewModes = [
  {
    value: 'overlay',
    label: 'Overlay',
    shortLabel: 'Over',
    icon: Square2StackIcon,
    description: 'Show diff overlay on image',
  },
  {
    value: 'toggle',
    label: 'Toggle',
    shortLabel: 'Toggle',
    icon: ArrowsRightLeftIcon,
    description: 'Toggle between baseline and current',
  },
  {
    value: 'onion-skin',
    label: 'Slide',
    shortLabel: 'Slide',
    icon: ViewColumnsIcon,
    description: 'Slide to compare baseline and current',
  },
];

/**
 * ViewModeToggle - Segmented control for view modes
 */
export function ViewModeToggle({
  value = 'overlay',
  onChange,
  disabled = false,
  compact = false,
  showLabels = true,
  className = '',
}) {
  return (
    <div
      className={`
        inline-flex items-center
        bg-[var(--vz-raised)] rounded-lg p-0.5 border border-[var(--vz-border-subtle)]
        ${className}
      `}
      role="radiogroup"
      aria-label="View mode"
    >
      {viewModes.map(mode => {
        let isActive = value === mode.value;
        let Icon = mode.icon;

        return (
          // biome-ignore lint/a11y/useSemanticElements: this segmented control intentionally exposes radio semantics for screen readers and tests.
          <button
            type="button"
            key={mode.value}
            onClick={() => onChange?.(mode.value)}
            disabled={disabled}
            className={`
              flex items-center justify-center gap-1.5
              ${compact ? 'p-2' : 'px-2 sm:px-3 py-1.5'}
              rounded-md text-xs font-medium
              transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                isActive
                  ? 'bg-[var(--accent-brand)] text-[var(--vz-bg)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_22%,transparent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-elevated)]'
              }
            `}
            role="radio"
            aria-checked={isActive}
            title={mode.description}
          >
            {compact ? (
              <Icon className="w-4 h-4" />
            ) : (
              <>
                <Icon className="w-4 h-4 hidden sm:block" />
                <span className={showLabels ? '' : 'sr-only'}>
                  {compact ? mode.shortLabel : mode.label}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ViewModeSelect - Dropdown version for very compact spaces
 */
export function ViewModeSelect({
  value = 'overlay',
  onChange,
  disabled = false,
  className = '',
}) {
  let currentMode = viewModes.find(m => m.value === value) || viewModes[0];
  let Icon = currentMode.icon;

  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        className="
          appearance-none
          bg-[var(--vz-raised)] border border-[var(--vz-border-subtle)]
          rounded-lg pl-8 pr-8 py-2
          text-sm text-[var(--text-secondary)]
          cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-brand)_34%,transparent)]
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        {viewModes.map(mode => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>

      {/* Icon */}
      <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />

      {/* Chevron */}
      <svg
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  );
}

export default ViewModeToggle;
