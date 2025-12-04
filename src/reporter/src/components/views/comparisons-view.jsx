import {
  CameraIcon,
  CheckCircleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  useAcceptAllBaselines,
  useReportData,
} from '../../hooks/queries/use-tdd-queries.js';
import useComparisonFilters from '../../hooks/use-comparison-filters.js';
import ScreenshotList from '../comparison/screenshot-list.jsx';
import DashboardFilters from '../dashboard/dashboard-filters.jsx';
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
} from '../design-system/index.js';
import { useToast } from '../ui/toast.jsx';

/**
 * Comparisons list view - displays all screenshots
 * Clicking a screenshot navigates to /comparison/:id
 */
export default function ComparisonsView() {
  const [, setLocation] = useLocation();
  const { addToast, confirm } = useToast();

  // Use TanStack Query for data
  const { data: reportData, isLoading, refetch } = useReportData();
  const acceptAllMutation = useAcceptAllBaselines();

  const {
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
  const handleSelectComparison = useCallback(
    comparison => {
      // Use stable ID - prefer id/signature, fall back to name (always present)
      // Never use array index as it changes with filters
      const id = comparison.id || comparison.signature || comparison.name;

      if (id) {
        setLocation(`/comparison/${encodeURIComponent(id)}`);
      }
    },
    [setLocation]
  );

  const handleAcceptAll = useCallback(async () => {
    const confirmed = await confirm(
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
  const hasNoComparisons =
    !reportData?.comparisons || reportData.comparisons.length === 0;

  // Check if filters are active
  const hasActiveFilters =
    filter !== 'all' ||
    searchQuery.trim() ||
    selectedBrowser !== 'all' ||
    selectedViewport !== 'all';

  // Check if there are changes to accept (failed or new comparisons)
  const hasChangesToAccept = reportData?.comparisons?.some(
    c => c.status === 'failed' || c.status === 'new'
  );

  // Count failed and new comparisons for the button label
  const failedCount =
    reportData?.comparisons?.filter(c => c.status === 'failed').length || 0;
  const newCount =
    reportData?.comparisons?.filter(c => c.status === 'new').length || 0;
  const totalToAccept = failedCount + newCount;

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
        <Alert variant="success" title={getChangesTitle(failedCount, newCount)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-3">
            <p className="text-sm text-slate-400 flex-1">
              {failedCount > 0
                ? 'Review changes and accept all to update baselines'
                : 'All screenshots are ready to be saved as baselines'}
            </p>
            <Button
              variant="success"
              onClick={handleAcceptAll}
              loading={acceptAllMutation.isPending}
              icon={CheckCircleIcon}
              className="w-full sm:w-auto"
            >
              Accept All ({totalToAccept})
            </Button>
          </div>
        </Alert>
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
          loadingStates={{}}
        />
      )}
    </div>
  );
}

function getChangesTitle(failedCount, newCount) {
  if (failedCount > 0 && newCount > 0) {
    return `${failedCount} Failed, ${newCount} New`;
  }
  if (failedCount > 0) {
    return `${failedCount} Visual Difference${failedCount !== 1 ? 's' : ''}`;
  }
  return `${newCount} New Baseline${newCount !== 1 ? 's' : ''}`;
}
