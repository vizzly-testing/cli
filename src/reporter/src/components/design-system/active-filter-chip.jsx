import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * ActiveFilterChip - Shows an active filter with dismiss button
 * Used to display currently applied filters that can be removed
 */

let warningChipClass =
  'bg-[var(--accent-warning-muted)] text-[var(--accent-warning)] border-[color-mix(in_srgb,var(--accent-warning)_24%,transparent)]';
let infoChipClass =
  'bg-[var(--accent-info-muted)] text-[var(--accent-info)] border-[color-mix(in_srgb,var(--accent-info)_24%,transparent)]';
let successChipClass =
  'bg-[var(--accent-success-muted)] text-[var(--accent-success)] border-[color-mix(in_srgb,var(--accent-success)_24%,transparent)]';
let dangerChipClass =
  'bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] border-[color-mix(in_srgb,var(--accent-danger)_24%,transparent)]';
let mediaChipClass =
  'bg-[var(--accent-media-muted)] text-[var(--accent-media)] border-[color-mix(in_srgb,var(--accent-media)_24%,transparent)]';
let neutralChipClass =
  'bg-white/5 text-[var(--text-secondary)] border-[var(--vz-border-subtle)]';

let colorClasses = {
  brand:
    'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)] border-[color-mix(in_srgb,var(--accent-brand)_24%,transparent)]',
  amber: warningChipClass,
  blue: infoChipClass,
  cyan: infoChipClass,
  emerald: successChipClass,
  gray: neutralChipClass,
  green: successChipClass,
  info: infoChipClass,
  media: mediaChipClass,
  neutral: neutralChipClass,
  orange: warningChipClass,
  purple: mediaChipClass,
  red: dangerChipClass,
};

export function ActiveFilterChip({
  label,
  color = 'neutral',
  onRemove,
  icon: Icon,
  className = '',
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs
        whitespace-nowrap flex-shrink-0
        ${colorClasses[color] || colorClasses.neutral}
        ${className}
      `}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span className="max-w-[150px] truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:text-[var(--text-primary)] transition-colors"
        >
          <XMarkIcon className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/**
 * ActiveFilterBar - Container for showing active filters with count summary
 */
export function ActiveFilterBar({
  filteredCount,
  totalCount,
  children,
  onClearAll,
  className = '',
}) {
  let hasFilters =
    children && (Array.isArray(children) ? children.length > 0 : true);

  if (!hasFilters) return null;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 sm:px-4 py-2 bg-black/20 border-b border-[var(--vz-border-subtle)]
        overflow-x-auto scrollbar-none
        ${className}
      `}
    >
      {(filteredCount !== undefined || totalCount !== undefined) && (
        <>
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
            <span className="font-medium text-[var(--text-primary)]">
              {filteredCount}
            </span>
            {totalCount !== undefined && (
              <span className="hidden sm:inline"> of {totalCount}</span>
            )}
          </span>
          <div className="w-px h-4 bg-[var(--vz-border-subtle)] flex-shrink-0" />
        </>
      )}

      <div className="flex items-center gap-1.5 flex-nowrap sm:flex-wrap">
        {children}
      </div>

      {onClearAll && (
        <>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
