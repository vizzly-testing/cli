import useComparisonFilters from '../../hooks/use-comparison-filters.js';
import useBaselineActions from '../../hooks/use-baseline-actions.js';
import DashboardFilters from '../dashboard/dashboard-filters.jsx';
import ComparisonList from '../comparison/comparison-list.jsx';
import { AllPassed } from '../dashboard/empty-state.jsx';

export default function ComparisonsView({
  reportData,
  setReportData,
  onRefresh,
  loading,
}) {
  let {
    filteredComparisons,
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
  } = useComparisonFilters(reportData?.comparisons);

  let { accept, reject, loadingStates } = useBaselineActions(setReportData);

  // Check if there are NO comparisons in the raw data (not filtered)
  let hasNoComparisons =
    !reportData.comparisons || reportData.comparisons.length === 0;

  // Check if filters are active
  let hasActiveFilters =
    filter !== 'all' ||
    searchQuery.trim() ||
    selectedBrowser !== 'all' ||
    selectedViewport !== 'all';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {hasNoComparisons ? (
        <AllPassed />
      ) : (
        <div className="space-y-6">
          <DashboardFilters
            filter={filter}
            setFilter={setFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedBrowser={selectedBrowser}
            setSelectedBrowser={setSelectedBrowser}
            selectedViewport={selectedViewport}
            setSelectedViewport={setSelectedViewport}
            availableFilters={availableFilters}
            counts={counts}
            onRefresh={onRefresh}
            loading={loading}
          />

          {filteredComparisons.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-gray-400 mb-2">
                No comparisons match your filters
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setFilter('all');
                    setSearchQuery('');
                    setSelectedBrowser('all');
                    setSelectedViewport('all');
                  }}
                  className="text-amber-400 hover:text-amber-300 text-sm underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <ComparisonList
              comparisons={filteredComparisons}
              onAccept={accept}
              onReject={reject}
              loadingStates={loadingStates}
            />
          )}
        </div>
      )}
    </div>
  );
}
