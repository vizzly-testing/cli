import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  BrowserIcon,
  FilterPill,
  SearchInput,
} from '@vizzly-testing/observatory';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FILTER_TYPES, SORT_TYPES } from '../../utils/constants.js';

/**
 * Get device icon based on viewport width
 */
function getDeviceIcon(width) {
  if (width <= 480) return DevicePhoneMobileIcon;
  if (width <= 1024) return DeviceTabletIcon;
  return ComputerDesktopIcon;
}

/**
 * Get device label for viewport
 */
function _getDeviceLabel(viewportStr) {
  let width = parseInt(viewportStr.split('×')[0], 10);
  if (width <= 480) return 'Mobile';
  if (width <= 1024) return 'Tablet';
  return 'Desktop';
}

/**
 * Custom dropdown for browser/viewport selection with icons
 */
function IconDropdown({
  value,
  onChange,
  options,
  placeholder,
  renderOption,
  renderValue,
  testId,
}) {
  let [isOpen, setIsOpen] = useState(false);
  let dropdownRef = useRef(null);

  let handleSelect = useCallback(
    val => {
      onChange(val);
      setIsOpen(false);
    },
    [onChange]
  );

  // Close on outside click
  let handleBlur = useCallback(e => {
    if (!dropdownRef.current?.contains(e.relatedTarget)) {
      setIsOpen(false);
    }
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropdown container needs blur handler
    <div className="relative" ref={dropdownRef} onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={testId}
        className={`
          inline-flex items-center gap-2 px-2.5 h-8 rounded-md text-xs font-medium
          bg-transparent border transition-all
          ${
            isOpen
              ? 'border-amber-500/50 ring-1 ring-amber-500/20'
              : 'border-slate-700/50 hover:border-slate-600'
          }
        `}
      >
        {renderValue ? (
          renderValue(value)
        ) : (
          <span className="text-slate-300">
            {value === 'all' ? placeholder : value}
          </span>
        )}
        <ChevronDownIcon
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl overflow-hidden">
          <div className="py-1 max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect('all')}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                ${value === 'all' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-300 hover:bg-slate-700/50'}
              `}
            >
              <span className="w-4 h-4" />
              <span>{placeholder}</span>
            </button>
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => handleSelect(option)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                  ${value === option ? 'bg-amber-500/10 text-amber-400' : 'text-slate-300 hover:bg-slate-700/50'}
                `}
              >
                {renderOption(option)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sort dropdown with icons
 */
function SortDropdown({ value, onChange }) {
  let [isOpen, setIsOpen] = useState(false);
  let dropdownRef = useRef(null);

  let sortOptions = [
    {
      value: SORT_TYPES.PRIORITY,
      label: 'Priority',
      description: 'Failed first',
    },
    { value: SORT_TYPES.NAME, label: 'Name', description: 'A to Z' },
    { value: SORT_TYPES.TIME, label: 'Time', description: 'Recent first' },
  ];

  let currentOption =
    sortOptions.find(o => o.value === value) || sortOptions[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          inline-flex items-center gap-2 px-2.5 h-8 rounded-md text-xs font-medium
          bg-transparent border transition-all
          ${
            isOpen
              ? 'border-amber-500/50 ring-1 ring-amber-500/20'
              : 'border-slate-700/50 hover:border-slate-600'
          }
        `}
      >
        <ArrowsUpDownIcon className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-slate-300">{currentOption.label}</span>
        <ChevronDownIcon
          className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full right-0 mt-1 z-50 w-48 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl overflow-hidden">
            <div className="py-1">
              {sortOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full flex flex-col items-start px-3 py-2 text-left transition-colors
                    ${value === option.value ? 'bg-amber-500/10' : 'hover:bg-slate-700/50'}
                  `}
                >
                  <span
                    className={
                      value === option.value
                        ? 'text-amber-400 font-medium'
                        : 'text-slate-300'
                    }
                  >
                    {option.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Active filter chip with remove button
 */
function ActiveFilter({ label, icon: Icon, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-400">
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:text-amber-200 transition-colors"
      >
        <XMarkIcon className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function DashboardFilters({
  filter,
  setFilter,
  sortBy,
  setSortBy,
  searchQuery,
  setSearchQuery,
  selectedBrowser,
  setSelectedBrowser,
  selectedViewport,
  setSelectedViewport,
  availableFilters,
  counts,
  onRefresh,
  loading,
}) {
  let [showMobileFilters, setShowMobileFilters] = useState(false);

  let hasAdvancedFilters =
    availableFilters.browsers.length > 1 ||
    availableFilters.viewports.length > 1;

  // Count active filters
  let activeFilterCount = useMemo(() => {
    let count = 0;
    if (filter !== FILTER_TYPES.ALL) count++;
    if (selectedBrowser !== 'all') count++;
    if (selectedViewport !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [filter, selectedBrowser, selectedViewport, searchQuery]);

  let clearAllFilters = useCallback(() => {
    setFilter(FILTER_TYPES.ALL);
    setSelectedBrowser('all');
    setSelectedViewport('all');
    setSearchQuery('');
  }, [setFilter, setSelectedBrowser, setSelectedViewport, setSearchQuery]);

  // Render browser option with icon
  let renderBrowserOption = useCallback(
    browser => (
      <>
        <BrowserIcon browser={browser} className="w-4 h-4" />
        <span className="capitalize">{browser}</span>
      </>
    ),
    []
  );

  // Render browser value
  let renderBrowserValue = useCallback(value => {
    if (value === 'all') {
      return <span className="text-slate-400">All browsers</span>;
    }
    return (
      <span className="flex items-center gap-2">
        <BrowserIcon browser={value} className="w-4 h-4" />
        <span className="text-slate-300 capitalize">{value}</span>
      </span>
    );
  }, []);

  // Render viewport option with device icon
  let renderViewportOption = useCallback(viewport => {
    let DeviceIcon = getDeviceIcon(parseInt(viewport.split('×')[0], 10));
    return (
      <>
        <DeviceIcon className="w-4 h-4 text-slate-400" />
        <span className="font-mono text-xs">{viewport}</span>
      </>
    );
  }, []);

  // Render viewport value
  let renderViewportValue = useCallback(value => {
    if (value === 'all') {
      return <span className="text-slate-400">All viewports</span>;
    }
    let DeviceIcon = getDeviceIcon(parseInt(value.split('×')[0], 10));
    return (
      <span className="flex items-center gap-2">
        <DeviceIcon className="w-4 h-4 text-slate-400" />
        <span className="text-slate-300 font-mono text-xs">{value}</span>
      </span>
    );
  }, []);

  return (
    <div className="space-y-3">
      {/* Main Filter Bar */}
      <div className="flex flex-col gap-3 p-3 bg-slate-800/30 border border-slate-700/40 rounded-xl">
        {/* Top Row: Search + Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex-1">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search screenshots..."
              className="w-full"
            />
          </div>

          {/* Mobile: Filter toggle */}
          {hasAdvancedFilters && (
            <button
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={`
                relative md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md transition-all
                ${
                  showMobileFilters || activeFilterCount > 0
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 border border-slate-700/50 hover:border-slate-600'
                }
              `}
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {/* Desktop: Sort */}
          <div className="hidden md:block">
            <SortDropdown value={sortBy} onChange={setSortBy} />
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <ArrowPathIcon
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Desktop: Filter Pills + Dropdowns */}
        <div className="hidden md:flex items-center gap-3 flex-wrap">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5">
            <FilterPill
              label="All"
              count={counts.all}
              color="gray"
              active={filter === FILTER_TYPES.ALL}
              onClick={() => setFilter(FILTER_TYPES.ALL)}
              testId="filter-status-all"
            />
            <FilterPill
              label="Failed"
              count={counts.failed}
              color="red"
              active={filter === FILTER_TYPES.FAILED}
              onClick={() => setFilter(FILTER_TYPES.FAILED)}
              testId="filter-status-failed"
            />
            <FilterPill
              label="New"
              count={counts.new}
              color="blue"
              active={filter === FILTER_TYPES.NEW}
              onClick={() => setFilter(FILTER_TYPES.NEW)}
              testId="filter-status-new"
            />
            <FilterPill
              label="Passed"
              count={counts.passed}
              color="emerald"
              active={filter === FILTER_TYPES.PASSED}
              onClick={() => setFilter(FILTER_TYPES.PASSED)}
              testId="filter-status-passed"
            />
          </div>

          {/* Divider */}
          {hasAdvancedFilters && <div className="w-px h-6 bg-slate-700/50" />}

          {/* Browser Filter */}
          {availableFilters.browsers.length > 1 && (
            <IconDropdown
              value={selectedBrowser}
              onChange={setSelectedBrowser}
              options={availableFilters.browsers}
              placeholder="All browsers"
              renderOption={renderBrowserOption}
              renderValue={renderBrowserValue}
              testId="filter-browser"
            />
          )}

          {/* Viewport Filter */}
          {availableFilters.viewports.length > 1 && (
            <IconDropdown
              value={selectedViewport}
              onChange={setSelectedViewport}
              options={availableFilters.viewports}
              placeholder="All viewports"
              renderOption={renderViewportOption}
              renderValue={renderViewportValue}
              testId="filter-viewport"
            />
          )}
        </div>

        {/* Mobile: Status Pills (always visible, horizontal scroll) */}
        <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <FilterPill
            label="All"
            count={counts.all}
            color="gray"
            active={filter === FILTER_TYPES.ALL}
            onClick={() => setFilter(FILTER_TYPES.ALL)}
            testId="mobile-filter-status-all"
          />
          <FilterPill
            label="Failed"
            count={counts.failed}
            color="red"
            active={filter === FILTER_TYPES.FAILED}
            onClick={() => setFilter(FILTER_TYPES.FAILED)}
            testId="mobile-filter-status-failed"
          />
          <FilterPill
            label="New"
            count={counts.new}
            color="blue"
            active={filter === FILTER_TYPES.NEW}
            onClick={() => setFilter(FILTER_TYPES.NEW)}
            testId="mobile-filter-status-new"
          />
          <FilterPill
            label="Passed"
            count={counts.passed}
            color="emerald"
            active={filter === FILTER_TYPES.PASSED}
            onClick={() => setFilter(FILTER_TYPES.PASSED)}
            testId="mobile-filter-status-passed"
          />
        </div>

        {/* Mobile: Expanded Filter Panel */}
        {showMobileFilters && hasAdvancedFilters && (
          <div className="md:hidden space-y-3 pt-2 border-t border-slate-700/30">
            {/* Sort */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Sort by</span>
              <SortDropdown value={sortBy} onChange={setSortBy} />
            </div>

            {/* Browser */}
            {availableFilters.browsers.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Browser</span>
                <IconDropdown
                  value={selectedBrowser}
                  onChange={setSelectedBrowser}
                  options={availableFilters.browsers}
                  placeholder="All browsers"
                  renderOption={renderBrowserOption}
                  renderValue={renderBrowserValue}
                  testId="filter-browser-mobile"
                />
              </div>
            )}

            {/* Viewport */}
            {availableFilters.viewports.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Viewport</span>
                <IconDropdown
                  value={selectedViewport}
                  onChange={setSelectedViewport}
                  options={availableFilters.viewports}
                  placeholder="All viewports"
                  renderOption={renderViewportOption}
                  renderValue={renderViewportValue}
                  testId="filter-viewport-mobile"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Filters Bar (shown when filters are active) */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Filters:</span>

          {filter !== FILTER_TYPES.ALL && (
            <ActiveFilter
              label={filter.charAt(0).toUpperCase() + filter.slice(1)}
              onRemove={() => setFilter(FILTER_TYPES.ALL)}
            />
          )}

          {selectedBrowser !== 'all' && (
            <ActiveFilter
              label={selectedBrowser}
              icon={() => (
                <BrowserIcon browser={selectedBrowser} className="w-3 h-3" />
              )}
              onRemove={() => setSelectedBrowser('all')}
            />
          )}

          {selectedViewport !== 'all' && (
            <ActiveFilter
              label={selectedViewport}
              icon={getDeviceIcon(parseInt(selectedViewport.split('×')[0], 10))}
              onRemove={() => setSelectedViewport('all')}
            />
          )}

          {searchQuery.trim() && (
            <ActiveFilter
              label={`"${searchQuery}"`}
              onRemove={() => setSearchQuery('')}
            />
          )}

          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
