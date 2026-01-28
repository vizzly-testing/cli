import {
  CameraIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import { useLocation } from 'wouter';
import {
  useAcceptAllBaselines,
  useAcceptBaseline,
  useRejectBaseline,
  useReportData,
} from '../../hooks/queries/use-tdd-queries.js';
import useComparisonFilters from '../../hooks/use-comparison-filters.js';
import ScreenshotList from '../comparison/screenshot-list.jsx';
import DashboardFilters from '../dashboard/dashboard-filters.jsx';
import { Button, Card, CardBody, EmptyState } from '../design-system/index.js';
import { useToast } from '../ui/toast.jsx';

/**
 * Action banner for accepting changes
 */
function ActionBanner({ failedCount, newCount, onAcceptAll, isLoading }) {
  let totalCount = failedCount + newCount;
  let hasFailures = failedCount > 0;

  return (
    <div
      className={`
      relative overflow-hidden rounded-xl border
      ${
        hasFailures
          ? 'bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent border-red-500/20'
          : 'bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20'
      }
    `}
    >
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative flex items-center gap-4 p-4">
        {/* Icon */}
        <div
          className={`
          flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
          ${
            hasFailures
              ? 'bg-red-500/20 text-red-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }
        `}
        >
          {hasFailures ? (
            <ExclamationTriangleIcon className="w-5 h-5" />
          ) : (
            <SparklesIcon className="w-5 h-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-sm font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {failedCount} changed
              </span>
            )}
            {newCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-sm font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {newCount} new
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {hasFailures
              ? 'Review visual differences and accept to update baselines'
              : 'New screenshots ready to be saved as baselines'}
          </p>
        </div>

        {/* Action */}
        <Button
          variant="success"
          onClick={onAcceptAll}
          loading={isLoading}
          icon={CheckCircleIcon}
          className="flex-shrink-0"
          data-testid="btn-accept-all"
        >
          Accept All ({totalCount})
        </Button>
      </div>
    </div>
  );
}

/**
 * Comparisons list view - displays all screenshots
 * Clicking a screenshot navigates to /comparison/:id
 */
export default function ComparisonsView() {
  let [, setLocation] = useLocation();
  let { addToast, confirm } = useToast();
  let [loadingStates, setLoadingStates] = useState({});

  // Use TanStack Query for data
  let { data: reportData, isLoading, refetch } = useReportData();
  let acceptAllMutation = useAcceptAllBaselines();
  let acceptMutation = useAcceptBaseline();
  let rejectMutation = useRejectBaseline();

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

  // Navigate to comparison detail view
  let handleSelectComparison = useCallback(
    comparison => {
      let id = comparison.id || comparison.signature || comparison.name;
      if (id) {
        setLocation(`/comparison/${encodeURIComponent(id)}`);
      }
    },
    [setLocation]
  );

  // Accept a single comparison
  let handleAcceptComparison = useCallback(
    id => {
      setLoadingStates(prev => ({ ...prev, [id]: 'accepting' }));
      acceptMutation.mutate(id, {
        onSuccess: () => {
          setLoadingStates(prev => ({ ...prev, [id]: 'accepted' }));
        },
        onError: err => {
          setLoadingStates(prev => ({ ...prev, [id]: undefined }));
          addToast(`Failed to accept: ${err.message}`, 'error');
        },
      });
    },
    [acceptMutation, addToast, setLoadingStates]
  );

  // Reject a single comparison
  let handleRejectComparison = useCallback(
    id => {
      setLoadingStates(prev => ({ ...prev, [id]: 'rejecting' }));
      rejectMutation.mutate(id, {
        onSuccess: () => {
          setLoadingStates(prev => ({ ...prev, [id]: 'rejected' }));
        },
        onError: err => {
          setLoadingStates(prev => ({ ...prev, [id]: undefined }));
          addToast(`Failed to reject: ${err.message}`, 'error');
        },
      });
    },
    [rejectMutation, addToast, setLoadingStates]
  );

  let handleAcceptAll = useCallback(async () => {
    let confirmed = await confirm(
      'This will update all failed and new screenshots.',
      'Accept all changes as new baselines?'
    );

    if (!confirmed) return;

    acceptAllMutation.mutate(undefined, {
      onSuccess: () => {
        addToast('All baselines accepted successfully', 'success');
      },
      onError: err => {
        console.error('Failed to accept all baselines:', err);
        addToast('Failed to accept all baselines. Please try again.', 'error');
      },
    });
  }, [acceptAllMutation, addToast, confirm]);

  // Check if there are NO comparisons in the raw data (not filtered)
  let hasNoComparisons =
    !reportData?.comparisons || reportData.comparisons.length === 0;

  // Check if filters are active
  let hasActiveFilters =
    filter !== 'all' ||
    searchQuery.trim() ||
    selectedBrowser !== 'all' ||
    selectedViewport !== 'all';

  // Check if there are changes to accept (failed or new comparisons)
  let hasChangesToAccept = reportData?.comparisons?.some(
    c => c.status === 'failed' || c.status === 'new'
  );

  // Count failed and new comparisons for the button label
  let failedCount =
    reportData?.comparisons?.filter(c => c.status === 'failed').length || 0;
  let newCount =
    reportData?.comparisons?.filter(c => c.status === 'new').length || 0;
  let _totalToAccept = failedCount + newCount;

  if (hasNoComparisons) {
    return (
      <EmptyState
        icon={CameraIcon}
        title="No Screenshots Yet"
        description="Run your tests with vizzlyScreenshot() to start capturing visual comparisons."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
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
        onRefresh={refetch}
        loading={isLoading}
      />

      {/* Accept All Banner */}
      {hasChangesToAccept && (
        <ActionBanner
          failedCount={failedCount}
          newCount={newCount}
          onAcceptAll={handleAcceptAll}
          isLoading={acceptAllMutation.isPending}
        />
      )}

      {/* Screenshot List */}
      {filteredComparisons.length === 0 ? (
        <Card hover={false}>
          <CardBody className="py-12">
            <EmptyState
              icon={FunnelIcon}
              title="No matches"
              description="No comparisons match your current filters."
              action={
                hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilter('all');
                      setSearchQuery('');
                      setSelectedBrowser('all');
                      setSelectedViewport('all');
                    }}
                  >
                    Clear all filters
                  </Button>
                )
              }
            />
          </CardBody>
        </Card>
      ) : (
        <ScreenshotList
          comparisons={filteredComparisons}
          onSelectComparison={handleSelectComparison}
          onAcceptComparison={handleAcceptComparison}
          onRejectComparison={handleRejectComparison}
          loadingStates={loadingStates}
        />
      )}
    </div>
  );
}
