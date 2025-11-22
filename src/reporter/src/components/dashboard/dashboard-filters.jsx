import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import { FILTER_TYPES, SORT_TYPES } from '../../utils/constants.js';

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
  let [showFilters, setShowFilters] = useState(false);
  let hasAdvancedFilters =
    availableFilters.browsers.length > 1 ||
    availableFilters.viewports.length > 1;

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Search and Actions Row */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search screenshots..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-gray-700 rounded-lg pl-10 pr-4 py-3 md:py-2.5 text-white placeholder-gray-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors text-base md:text-sm"
          />
        </div>

        {/* Mobile: Filter toggle button */}
        {hasAdvancedFilters && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`md:hidden inline-flex items-center justify-center bg-slate-800 border border-gray-700 p-3 rounded-lg transition-colors touch-manipulation ${
              showFilters
                ? 'text-amber-400 border-amber-500'
                : 'text-gray-300 hover:text-white'
            }`}
            title="Filters"
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
          </button>
        )}

        {/* Desktop: Sort and refresh */}
        <div className="hidden md:flex items-center gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-slate-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
          >
            <option value={SORT_TYPES.PRIORITY}>Priority</option>
            <option value={SORT_TYPES.NAME}>Name</option>
            <option value={SORT_TYPES.TIME}>Time</option>
          </select>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-gray-700 text-gray-300 hover:text-white p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <ArrowPathIcon
              className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Mobile: Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="md:hidden inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-gray-700 text-gray-300 hover:text-white p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          title="Refresh"
        >
          <ArrowPathIcon
            className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Filter Pills Row - Horizontal scroll on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 scroll-snap-x md:flex-wrap md:overflow-visible">
        <span className="hidden md:inline text-sm text-gray-400 mr-1 flex-shrink-0">
          Status:
        </span>
        <button
          onClick={() => setFilter(FILTER_TYPES.ALL)}
          className={`flex-shrink-0 px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition-all touch-manipulation scroll-snap-item ${
            filter === FILTER_TYPES.ALL
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
              : 'bg-slate-800 text-gray-400 hover:bg-slate-700 active:bg-slate-600 hover:text-white border border-gray-700'
          }`}
        >
          All <span className="ml-1 md:ml-1.5 opacity-75">({counts.all})</span>
        </button>
        <button
          onClick={() => setFilter(FILTER_TYPES.FAILED)}
          className={`flex-shrink-0 px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition-all touch-manipulation scroll-snap-item ${
            filter === FILTER_TYPES.FAILED
              ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
              : 'bg-slate-800 text-gray-400 hover:bg-slate-700 active:bg-slate-600 hover:text-white border border-gray-700'
          }`}
        >
          Failed{' '}
          <span className="ml-1 md:ml-1.5 opacity-75">({counts.failed})</span>
        </button>
        <button
          onClick={() => setFilter(FILTER_TYPES.NEW)}
          className={`flex-shrink-0 px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition-all touch-manipulation scroll-snap-item ${
            filter === FILTER_TYPES.NEW
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
              : 'bg-slate-800 text-gray-400 hover:bg-slate-700 active:bg-slate-600 hover:text-white border border-gray-700'
          }`}
        >
          New <span className="ml-1 md:ml-1.5 opacity-75">({counts.new})</span>
        </button>
        <button
          onClick={() => setFilter(FILTER_TYPES.PASSED)}
          className={`flex-shrink-0 px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition-all touch-manipulation scroll-snap-item ${
            filter === FILTER_TYPES.PASSED
              ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
              : 'bg-slate-800 text-gray-400 hover:bg-slate-700 active:bg-slate-600 hover:text-white border border-gray-700'
          }`}
        >
          Passed{' '}
          <span className="ml-1 md:ml-1.5 opacity-75">({counts.passed})</span>
        </button>

        {/* Desktop: Browser and Viewport filters inline */}
        {availableFilters.browsers.length > 1 && (
          <div className="hidden md:flex items-center">
            <span className="text-sm text-gray-400 ml-4 mr-1">Browser:</span>
            <select
              value={selectedBrowser}
              onChange={e => setSelectedBrowser(e.target.value)}
              className="bg-slate-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            >
              <option value="all">All</option>
              {availableFilters.browsers.map(browser => (
                <option key={browser} value={browser}>
                  {browser}
                </option>
              ))}
            </select>
          </div>
        )}

        {availableFilters.viewports.length > 1 && (
          <div className="hidden md:flex items-center">
            <span className="text-sm text-gray-400 ml-4 mr-1">Viewport:</span>
            <select
              value={selectedViewport}
              onChange={e => setSelectedViewport(e.target.value)}
              className="bg-slate-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            >
              <option value="all">All</option>
              {availableFilters.viewports.map(viewport => (
                <option key={viewport} value={viewport}>
                  {viewport}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Mobile: Expanded filter panel */}
      {showFilters && hasAdvancedFilters && (
        <div className="md:hidden bg-slate-800/50 border border-gray-700 rounded-lg p-3 space-y-3 animate-slide-down">
          {/* Sort */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-slate-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            >
              <option value={SORT_TYPES.PRIORITY}>Priority</option>
              <option value={SORT_TYPES.NAME}>Name</option>
              <option value={SORT_TYPES.TIME}>Time</option>
            </select>
          </div>

          {/* Browser Filter */}
          {availableFilters.browsers.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Browser:</span>
              <select
                value={selectedBrowser}
                onChange={e => setSelectedBrowser(e.target.value)}
                className="bg-slate-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              >
                <option value="all">All</option>
                {availableFilters.browsers.map(browser => (
                  <option key={browser} value={browser}>
                    {browser}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Viewport Filter */}
          {availableFilters.viewports.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Viewport:</span>
              <select
                value={selectedViewport}
                onChange={e => setSelectedViewport(e.target.value)}
                className="bg-slate-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              >
                <option value="all">All</option>
                {availableFilters.viewports.map(viewport => (
                  <option key={viewport} value={viewport}>
                    {viewport}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
