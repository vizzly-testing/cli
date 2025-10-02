import { useState, useCallback } from 'react';
import useComparisonFilters from '../../hooks/use-comparison-filters.js';
import useBaselineActions from '../../hooks/use-baseline-actions.js';
import DashboardFilters from '../dashboard/dashboard-filters.jsx';
import ComparisonList from '../comparison/comparison-list.jsx';
import { acceptAllBaselines } from '../../services/api-client.js';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { useToast } from '../ui/toast.jsx';

export default function ComparisonsView({
  reportData,
  setReportData,
  onRefresh,
  loading,
}) {
  let [acceptingAll, setAcceptingAll] = useState(false);
  let { addToast, confirm } = useToast();

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

  let handleAcceptAll = useCallback(async () => {
    let confirmed = await confirm(
      'This will update all failed and new screenshots.',
      'Accept all changes as new baselines?'
    );

    if (!confirmed) return;

    setAcceptingAll(true);
    try {
      await acceptAllBaselines();

      // Update all failed/new comparisons to passed
      setReportData(prevData => ({
        ...prevData,
        comparisons: prevData.comparisons.map(c =>
          c.status === 'failed' || c.status === 'new'
            ? { ...c, status: 'passed', diffPercentage: 0, diff: null }
            : c
        ),
      }));

      onRefresh?.();
    } catch (err) {
      console.error('Failed to accept all baselines:', err);
      addToast('Failed to accept all baselines. Please try again.', 'error');
    } finally {
      setAcceptingAll(false);
    }
  }, [setReportData, onRefresh, addToast, confirm]);

  // Check if there are NO comparisons in the raw data (not filtered)
  let hasNoComparisons =
    !reportData.comparisons || reportData.comparisons.length === 0;

  // Check if filters are active
  let hasActiveFilters =
    filter !== 'all' ||
    searchQuery.trim() ||
    selectedBrowser !== 'all' ||
    selectedViewport !== 'all';

  // Check if there are changes to accept (failed or new comparisons)
  let hasChangesToAccept = reportData.comparisons?.some(
    c => c.status === 'failed' || c.status === 'new'
  );

  // Count failed and new comparisons for the button label
  let failedCount =
    reportData.comparisons?.filter(c => c.status === 'failed').length || 0;
  let newCount =
    reportData.comparisons?.filter(c => c.status === 'new').length || 0;
  let totalToAccept = failedCount + newCount;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {hasNoComparisons ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">
            No Screenshots Yet
          </h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Run your tests to start capturing visual comparisons.
          </p>
        </div>
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

          {/* Accept All Button - Only show when there are changes */}
          {hasChangesToAccept && (
            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold mb-1">
                    {failedCount > 0 && newCount > 0
                      ? `${failedCount} Failed • ${newCount} New Baseline${newCount !== 1 ? 's' : ''}`
                      : failedCount > 0
                        ? `${failedCount} Visual Difference${failedCount !== 1 ? 's' : ''} Detected`
                        : `${newCount} New Baseline${newCount !== 1 ? 's' : ''} Created`}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {failedCount > 0
                      ? 'Review changes and accept all to update baselines'
                      : 'All screenshots are ready to be saved as baselines'}
                  </p>
                </div>
                <button
                  onClick={handleAcceptAll}
                  disabled={acceptingAll}
                  className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-white font-medium px-6 py-3 rounded-lg transition-colors flex-shrink-0"
                >
                  <CheckCircleIcon className="w-5 h-5" />
                  <span>
                    {acceptingAll
                      ? 'Accepting...'
                      : `Accept All (${totalToAccept})`}
                  </span>
                </button>
              </div>
            </div>
          )}

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
