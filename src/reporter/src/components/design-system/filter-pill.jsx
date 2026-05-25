/**
 * FilterPill - Reusable filter button with label, count, and color state
 * Used in table toolbars for status filtering
 */

let warningPillClasses = {
  active:
    'bg-[var(--accent-warning-muted)] text-[var(--accent-warning)] border-[color-mix(in_srgb,var(--accent-warning)_36%,transparent)]',
  inactive:
    'text-[var(--accent-warning)] border-transparent hover:border-[color-mix(in_srgb,var(--accent-warning)_30%,transparent)] hover:bg-[var(--accent-warning-muted)]',
};
let infoPillClasses = {
  active:
    'bg-[var(--accent-info-muted)] text-[var(--accent-info)] border-[color-mix(in_srgb,var(--accent-info)_36%,transparent)]',
  inactive:
    'text-[var(--accent-info)] border-transparent hover:border-[color-mix(in_srgb,var(--accent-info)_30%,transparent)] hover:bg-[var(--accent-info-muted)]',
};
let successPillClasses = {
  active:
    'bg-[var(--accent-success-muted)] text-[var(--accent-success)] border-[color-mix(in_srgb,var(--accent-success)_36%,transparent)]',
  inactive:
    'text-[var(--accent-success)] border-transparent hover:border-[color-mix(in_srgb,var(--accent-success)_30%,transparent)] hover:bg-[var(--accent-success-muted)]',
};
let dangerPillClasses = {
  active:
    'bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] border-[color-mix(in_srgb,var(--accent-danger)_36%,transparent)]',
  inactive:
    'text-[var(--accent-danger)] border-transparent hover:border-[color-mix(in_srgb,var(--accent-danger)_30%,transparent)] hover:bg-[var(--accent-danger-muted)]',
};
let mediaPillClasses = {
  active:
    'bg-[var(--accent-media-muted)] text-[var(--accent-media)] border-[color-mix(in_srgb,var(--accent-media)_36%,transparent)]',
  inactive:
    'text-[var(--accent-media)] border-transparent hover:border-[color-mix(in_srgb,var(--accent-media)_30%,transparent)] hover:bg-[var(--accent-media-muted)]',
};
let neutralPillClasses = {
  active: 'bg-white/8 text-[var(--text-secondary)] border-[var(--vz-border)]',
  inactive:
    'text-[var(--text-tertiary)] border-transparent hover:border-[var(--vz-border-subtle)] hover:bg-white/5',
};

let colorClasses = {
  brand: {
    active:
      'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)] border-[color-mix(in_srgb,var(--accent-brand)_36%,transparent)]',
    inactive:
      'text-[color-mix(in_srgb,var(--accent-brand)_80%,var(--text-secondary))] border-transparent hover:border-[color-mix(in_srgb,var(--accent-brand)_30%,transparent)] hover:bg-[var(--accent-brand-muted)]',
  },
  amber: warningPillClasses,
  blue: infoPillClasses,
  cyan: infoPillClasses,
  emerald: successPillClasses,
  gray: neutralPillClasses,
  green: successPillClasses,
  info: infoPillClasses,
  media: mediaPillClasses,
  neutral: neutralPillClasses,
  orange: warningPillClasses,
  purple: mediaPillClasses,
  red: dangerPillClasses,
};

export function FilterPill({
  label,
  count = 0,
  color = 'neutral',
  active = false,
  disabled = false,
  onClick,
  icon: Icon,
  className = '',
  testId,
}) {
  let colors = colorClasses[color] || colorClasses.neutral;
  let stateClass = active ? colors.active : colors.inactive;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || count === 0}
      data-testid={testId}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
        border transition-all duration-150
        ${stateClass}
        ${disabled || count === 0 ? 'opacity-85 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{label}</span>
      <span
        className={`
          px-1 py-0.5 rounded text-[10px] font-semibold min-w-[18px] text-center
          ${active ? 'bg-white/10' : 'bg-[var(--vz-raised)]'}
        `}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * FilterPillGroup - Container for a group of filter pills with optional dividers
 */
export function FilterPillGroup({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {children}
    </div>
  );
}

/**
 * FilterDivider - Visual separator between filter groups
 */
export function FilterDivider() {
  return <div className="w-px h-5 bg-[var(--vz-border-subtle)]" />;
}
