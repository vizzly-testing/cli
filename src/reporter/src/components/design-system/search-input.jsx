import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * SearchInput - Reusable search input with icon and clear button
 * Used in table toolbars for filtering by text
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 bg-[var(--vz-bg)] border border-[var(--vz-border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--vz-border-strong)] focus:ring-1 focus:ring-[var(--vz-border-strong)] transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
