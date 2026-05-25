import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ActiveFilterBar, ActiveFilterChip } from './active-filter-chip.jsx';
import { FilterDivider, FilterPill, FilterPillGroup } from './filter-pill.jsx';
import { SearchInput } from './search-input.jsx';

/**
 * TableToolbar - Integrated toolbar for tables with search, filters, and summary
 * Observatory Design System
 */
export function TableToolbar({
  // Search
  searchTerm = '',
  onSearchChange,
  searchPlaceholder = 'Search...',

  // Filters
  filterGroups = [],
  activeFilters = new Set(),
  onFilterToggle,

  // Dropdown filters (like branch selector)
  dropdownFilters = [],

  // Summary stats
  totalCount,
  filteredCount,
  summaryStats = [],

  // Actions (right side of summary row)
  actions,

  // Clear all
  onClearAll,

  children,
}) {
  let [openDropdown, setOpenDropdown] = useState(null);
  let dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  let activeFilterCount =
    (searchTerm ? 1 : 0) +
    activeFilters.size +
    dropdownFilters.filter(d => d.value).length;

  let hasActiveFilters = activeFilterCount > 0;

  let handleClearAll = useCallback(() => {
    onClearAll?.();
  }, [onClearAll]);

  // Render filter pills for a group
  let renderFilterPills = filters =>
    filters.map(filter => (
      <FilterPill
        key={filter.key}
        label={filter.label}
        count={filter.count}
        color={filter.color}
        active={activeFilters.has(filter.key)}
        onClick={() => onFilterToggle?.(filter.key)}
        icon={filter.icon}
      />
    ));

  // Render dropdown filter
  let renderDropdownFilter = dropdown => {
    let isOpen = openDropdown === dropdown.key;
    let hasValue = !!dropdown.value;

    return (
      <div
        key={dropdown.key}
        className="relative"
        ref={isOpen ? dropdownRef : null}
      >
        <button
          type="button"
          onClick={() => setOpenDropdown(isOpen ? null : dropdown.key)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
            border transition-all duration-150 whitespace-nowrap
            ${
              hasValue
                ? 'bg-[var(--accent-info-muted)] text-[var(--accent-info)] border-[color-mix(in_srgb,var(--accent-info)_28%,transparent)]'
                : 'bg-transparent text-[var(--text-tertiary)] border-[var(--vz-border-subtle)] hover:text-[var(--text-secondary)] hover:border-[var(--vz-border)]'
            }
          `}
        >
          <span>{dropdown.value || dropdown.label}</span>
          <ChevronDownIcon
            className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="py-1 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  dropdown.onChange?.('');
                  setOpenDropdown(null);
                }}
                className={`
                  w-full px-3 py-2 text-left text-sm transition-colors
                  ${!dropdown.value ? 'bg-[var(--accent-info-muted)] text-[var(--accent-info)]' : 'text-[var(--text-secondary)] hover:bg-[var(--vz-elevated)]'}
                `}
              >
                {dropdown.allLabel || `All ${dropdown.label.toLowerCase()}s`}
              </button>
              {dropdown.options.map(option => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => {
                    dropdown.onChange?.(option.value);
                    setOpenDropdown(null);
                  }}
                  className={`
                    w-full px-3 py-2 text-left text-sm transition-colors truncate
                    ${dropdown.value === option.value ? 'bg-[var(--accent-info-muted)] text-[var(--accent-info)]' : 'text-[var(--text-secondary)] hover:bg-[var(--vz-elevated)]'}
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vz-table-toolbar">
      {/* Search row */}
      {onSearchChange && (
        <div className="vz-table-toolbar__search">
          <SearchInput
            value={searchTerm}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        </div>
      )}

      {/* Filters row */}
      {filterGroups.length > 0 && (
        <div className="vz-table-toolbar__filters">
          {filterGroups.map((group, index) => (
            <Fragment key={group.key || index}>
              {index > 0 && <FilterDivider />}
              <FilterPillGroup>
                {renderFilterPills(group.filters)}
              </FilterPillGroup>
            </Fragment>
          ))}

          {/* Dropdown filters */}
          {dropdownFilters.length > 0 && (
            <>
              <FilterDivider />
              <div className="flex items-center gap-2" ref={dropdownRef}>
                {dropdownFilters.map(renderDropdownFilter)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <ActiveFilterBar filteredCount={filteredCount} totalCount={totalCount}>
          {searchTerm && (
            <ActiveFilterChip
              label={`"${searchTerm}"`}
              color="media"
              onRemove={() => onSearchChange?.('')}
            />
          )}

          {filterGroups.flatMap(group =>
            group.filters
              .filter(f => activeFilters.has(f.key))
              .map(filter => (
                <ActiveFilterChip
                  key={filter.key}
                  label={filter.label}
                  color={filter.color}
                  icon={filter.icon}
                  onRemove={() => onFilterToggle?.(filter.key)}
                />
              ))
          )}

          {dropdownFilters
            .filter(d => d.value)
            .map(dropdown => (
              <ActiveFilterChip
                key={dropdown.key}
                label={dropdown.value}
                color="media"
                onRemove={() => dropdown.onChange?.('')}
              />
            ))}

          {onClearAll && (
            <button
              type="button"
              onClick={handleClearAll}
              className="vz-table-toolbar__clear"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
        </ActiveFilterBar>
      )}

      {/* Summary Row */}
      {(summaryStats.length > 0 || actions || filteredCount !== undefined) && (
        <div className="vz-table-toolbar__summary">
          <div className="vz-table-toolbar__stats">
            {filteredCount !== undefined && (
              <span className="vz-table-toolbar__count">
                {filteredCount} builds
              </span>
            )}
            {summaryStats.map((stat, index) => (
              <Fragment key={stat.key || index}>
                <span className="vz-table-toolbar__stat-dot">•</span>
                <span
                  className={`vz-table-toolbar__stat ${stat.colorClass || ''}`}
                >
                  {stat.value} {stat.label}
                </span>
              </Fragment>
            ))}
          </div>
          {actions && (
            <div className="vz-table-toolbar__actions">{actions}</div>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
